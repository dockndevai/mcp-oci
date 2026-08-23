import { describe, expect, it } from "vitest";
import {
  generateModule,
  generateTerraform,
  sanitizeName,
  type OciResource,
} from "../src/terraform/generate.js";
import { buildDependencyGraph, provisioningOrder } from "../src/terraform/graph.js";
import { redactSecrets } from "../src/redact.js";

describe("sanitizeName", () => {
  it("produces valid terraform local names", () => {
    expect(sanitizeName("Prod VCN")).toBe("prod_vcn");
    expect(sanitizeName("web-app.01")).toBe("web_app_01");
  });
  it("never starts with a digit", () => {
    expect(sanitizeName("123abc")).toMatch(/^[a-z_]/);
  });
});

describe("generateTerraform", () => {
  it("maps a VCN to oci_core_vcn with cidr blocks", () => {
    const r: OciResource = {
      resourceType: "Vcn",
      identifier: "ocid1.vcn.oc1..abc",
      displayName: "prod-vcn",
      compartmentId: "ocid1.compartment.oc1..c",
      attributes: { cidrBlocks: ["10.0.0.0/16"], dnsLabel: "prod" },
    };
    const { hcl, recognized } = generateTerraform(r);
    expect(recognized).toBe(true);
    expect(hcl).toContain('resource "oci_core_vcn" "prod_vcn"');
    expect(hcl).toContain('cidr_blocks = ["10.0.0.0/16"]');
    expect(hcl).toContain("compartment_id = var.compartment_ocid");
  });

  it("references the parent VCN from a subnet", () => {
    const r: OciResource = {
      resourceType: "Subnet",
      identifier: "ocid1.subnet.oc1..s",
      displayName: "app-subnet",
      attributes: { cidrBlock: "10.0.1.0/24", vcnId: "ocid1.vcn.oc1..myvcn" },
    };
    const { hcl } = generateTerraform(r);
    expect(hcl).toContain("vcn_id = oci_core_vcn.myvcn.id");
    expect(hcl).toContain('cidr_block = "10.0.1.0/24"');
  });

  it("emits nested blocks for instance shape_config and source_details", () => {
    const r: OciResource = {
      resourceType: "Instance",
      identifier: "ocid1.instance.oc1..i",
      displayName: "worker",
      attributes: {
        availabilityDomain: "AD-1",
        shape: "VM.Standard.E4.Flex",
        shapeConfig: { ocpus: 2, memoryInGBs: 16 },
        imageId: "ocid1.image.oc1..img",
        subnetId: "ocid1.subnet.oc1..sub",
      },
    };
    const { hcl } = generateTerraform(r);
    expect(hcl).toContain("shape_config {");
    expect(hcl).toContain("ocpus = 2");
    expect(hcl).toContain("source_details {");
    expect(hcl).toContain('source_type = "image"');
    expect(hcl).toContain("create_vnic_details {");
  });

  it("falls back to an annotated skeleton for unknown types", () => {
    const { hcl, recognized } = generateTerraform({
      resourceType: "AutonomousDatabase",
      identifier: "ocid1.autonomousdatabase.oc1..db",
    });
    expect(recognized).toBe(false);
    expect(hcl).toContain("Unrecognised resource type 'AutonomousDatabase'");
  });

  it("generateModule includes provider variables and all blocks", () => {
    const mod = generateModule([
      { resourceType: "Vcn", identifier: "ocid1.vcn.oc1..v", displayName: "v", attributes: { cidrBlocks: ["10.0.0.0/16"] } },
    ]);
    expect(mod).toContain('variable "compartment_ocid"');
    expect(mod).toContain('resource "oci_core_vcn"');
  });
});

describe("dependency graph", () => {
  const resources: OciResource[] = [
    { resourceType: "Vcn", identifier: "vcn1", attributes: {} },
    { resourceType: "Subnet", identifier: "sub1", attributes: { vcnId: "vcn1" } },
    { resourceType: "Instance", identifier: "inst1", attributes: { subnetId: "sub1", imageId: "img-external" } },
  ];

  it("builds nodes and edges from reference fields", () => {
    const g = buildDependencyGraph(resources);
    expect(g.nodes).toHaveLength(3);
    expect(g.edges).toContainEqual({ from: "sub1", to: "vcn1", relation: "in-vcn" });
    expect(g.edges).toContainEqual({ from: "inst1", to: "sub1", relation: "in-subnet" });
  });

  it("flags references to resources not in the set as dangling", () => {
    const g = buildDependencyGraph(resources);
    expect(g.danglingReferences).toContain("img-external");
  });

  it("orders dependencies before dependents", () => {
    const g = buildDependencyGraph(resources);
    const order = provisioningOrder(g);
    expect(order.indexOf("vcn1")).toBeLessThan(order.indexOf("sub1"));
    expect(order.indexOf("sub1")).toBeLessThan(order.indexOf("inst1"));
  });
});

describe("secret redaction", () => {
  it("redacts secret-shaped keys but keeps structure", () => {
    const input = {
      displayName: "db",
      password: "hunter2",
      config: { apiKey: "abc", nested: { client_secret: "xyz", port: 5432 } },
      tokens: ["keep-array-structure"],
    };
    const out = redactSecrets(input) as any;
    expect(out.displayName).toBe("db");
    expect(out.password).toBe("***REDACTED***");
    expect(out.config.apiKey).toBe("***REDACTED***");
    expect(out.config.nested.client_secret).toBe("***REDACTED***");
    expect(out.config.nested.port).toBe(5432);
  });

  it("does not mutate the original", () => {
    const input = { password: "secret" };
    redactSecrets(input);
    expect(input.password).toBe("secret");
  });
});
