/**
 * Terraform (HCL) generation from discovered OCI resources.
 *
 * This is a pure, dependency-free module so it is fully unit-testable without a
 * live tenancy. It maps a normalised resource into a `resource "<type>" "<name>"`
 * block. Known OCI types get faithful attribute mapping; unknown types fall back
 * to a commented skeleton so the output is always a useful starting point.
 */

/** A normalised resource, as assembled from OCI discovery calls. */
export interface OciResource {
  /** OCI resource type as reported by Resource Search, e.g. "Vcn", "Instance". */
  resourceType: string;
  /** The resource OCID. */
  identifier: string;
  displayName?: string;
  compartmentId?: string;
  /** Raw attributes fetched from the resource's service API. */
  attributes?: Record<string, unknown>;
}

/** Marker for a raw HCL expression (emitted unquoted, e.g. a resource reference). */
export class Raw {
  constructor(readonly expr: string) {}
}
export const ref = (expr: string): Raw => new Raw(expr);

type Hcl = Record<string, unknown>;

/** Turn an arbitrary display name / ocid into a safe Terraform local name. */
export function sanitizeName(input: string): string {
  const base = input
    .replace(/^ocid1\.[a-z]+\.[a-z0-9-]*\./i, "")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const safe = base || "resource";
  return /^[a-z_]/.test(safe) ? safe : `r_${safe}`;
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderValue(value: unknown, indent: string): string {
  if (value instanceof Raw) return value.expr;
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return quote(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => renderValue(v, indent)).join(", ");
    return `[${items}]`;
  }
  if (typeof value === "object") {
    // Rendered by the caller as a nested block; inline maps are rare here.
    return renderBlockBody(value as Hcl, `${indent}  `);
  }
  return quote(String(value));
}

function renderBlockBody(attrs: Hcl, indent: string): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Raw)) {
      // Nested block.
      lines.push(`${indent}${key} {`);
      lines.push(renderBlockBody(value as Hcl, `${indent}  `));
      lines.push(`${indent}}`);
    } else {
      lines.push(`${indent}${key} = ${renderValue(value, indent)}`);
    }
  }
  return lines.join("\n");
}

export function renderResourceBlock(tfType: string, name: string, attrs: Hcl): string {
  return `resource "${tfType}" "${name}" {\n${renderBlockBody(attrs, "  ")}\n}`;
}

// --- Per-type mappers --------------------------------------------------------

type Mapper = (r: OciResource) => { tfType: string; attrs: Hcl };

const compartmentRef = (r: OciResource): unknown =>
  r.compartmentId ? ref("var.compartment_ocid") : undefined;

const MAPPERS: Record<string, Mapper> = {
  Vcn: (r) => {
    const a = r.attributes ?? {};
    return {
      tfType: "oci_core_vcn",
      attrs: {
        compartment_id: compartmentRef(r),
        display_name: r.displayName ?? a.displayName,
        cidr_blocks: a.cidrBlocks ?? (a.cidrBlock ? [a.cidrBlock] : undefined),
        dns_label: a.dnsLabel,
      },
    };
  },
  Subnet: (r) => {
    const a = r.attributes ?? {};
    return {
      tfType: "oci_core_subnet",
      attrs: {
        compartment_id: compartmentRef(r),
        vcn_id: a.vcnId ? ref(`oci_core_vcn.${sanitizeName(String(a.vcnId))}.id`) : undefined,
        cidr_block: a.cidrBlock,
        display_name: r.displayName ?? a.displayName,
        dns_label: a.dnsLabel,
        prohibit_public_ip_on_vnic: a.prohibitPublicIpOnVnic,
      },
    };
  },
  Instance: (r) => {
    const a = r.attributes ?? {};
    const shapeConfig = a.shapeConfig as Record<string, unknown> | undefined;
    return {
      tfType: "oci_core_instance",
      attrs: {
        compartment_id: compartmentRef(r),
        availability_domain: a.availabilityDomain,
        display_name: r.displayName ?? a.displayName,
        shape: a.shape,
        shape_config: shapeConfig
          ? { ocpus: shapeConfig.ocpus, memory_in_gbs: shapeConfig.memoryInGBs }
          : undefined,
        source_details: a.imageId
          ? { source_type: "image", source_id: a.imageId }
          : undefined,
        create_vnic_details: a.subnetId
          ? { subnet_id: ref(`oci_core_subnet.${sanitizeName(String(a.subnetId))}.id`) }
          : undefined,
      },
    };
  },
  Bucket: (r) => {
    const a = r.attributes ?? {};
    return {
      tfType: "oci_objectstorage_bucket",
      attrs: {
        compartment_id: compartmentRef(r),
        namespace: a.namespace,
        name: r.displayName ?? a.name,
      },
    };
  },
  Compartment: (r) => {
    const a = r.attributes ?? {};
    return {
      tfType: "oci_identity_compartment",
      attrs: {
        compartment_id: ref("var.parent_compartment_ocid"),
        name: r.displayName ?? a.name,
        description: a.description ?? r.displayName ?? a.name,
      },
    };
  },
};

/**
 * Generate a Terraform resource block for a single OCI resource. Returns HCL and
 * whether the type was recognised.
 */
export function generateTerraform(resource: OciResource): { hcl: string; recognized: boolean } {
  const name = sanitizeName(resource.displayName || resource.identifier || resource.resourceType);
  const mapper = MAPPERS[resource.resourceType];
  if (!mapper) {
    const skeleton =
      `# Unrecognised resource type '${resource.resourceType}'.\n` +
      `# Review and map these attributes to the correct oci_* resource.\n` +
      `# ${JSON.stringify({ id: resource.identifier, attributes: resource.attributes })}\n` +
      `# resource "oci_<service>_<type>" "${name}" {\n#   compartment_id = var.compartment_ocid\n# }`;
    return { hcl: skeleton, recognized: false };
  }
  const { tfType, attrs } = mapper(resource);
  return { hcl: renderResourceBlock(tfType, name, attrs), recognized: true };
}

/** Generate a full module (provider + variables + all resource blocks). */
export function generateModule(resources: OciResource[]): string {
  const header = [
    "# Generated by mcp-oci — review before applying.",
    'variable "compartment_ocid" { type = string }',
    'variable "parent_compartment_ocid" { type = string, default = "" }',
    "",
  ].join("\n");
  const blocks = resources.map((r) => generateTerraform(r).hcl).join("\n\n");
  return `${header}\n${blocks}\n`;
}

export const SUPPORTED_TYPES = Object.keys(MAPPERS);
