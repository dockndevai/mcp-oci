/**
 * Dependency graph construction. Pure and testable.
 *
 * Given a flat list of discovered resources (each carrying the reference fields
 * we know about — vcnId, subnetId, routeTableId, compartmentId), build a
 * node/edge graph describing how they relate. This is what lets the model reason
 * about provisioning order and blast radius.
 */
import type { OciResource } from "./generate.js";

export interface GraphNode {
  id: string;
  type: string;
  name?: string;
}

export interface GraphEdge {
  from: string; // dependent resource OCID
  to: string; // dependency resource OCID
  relation: string; // e.g. "subnet-of", "in-vcn"
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** OCIDs referenced as dependencies but not present in the input set. */
  danglingReferences: string[];
}

/** Reference fields we understand, mapped to a relation label. */
const REFERENCE_FIELDS: Array<{ field: string; relation: string }> = [
  { field: "vcnId", relation: "in-vcn" },
  { field: "subnetId", relation: "in-subnet" },
  { field: "routeTableId", relation: "uses-route-table" },
  { field: "securityListIds", relation: "uses-security-list" },
  { field: "networkSecurityGroupIds", relation: "uses-nsg" },
  { field: "imageId", relation: "from-image" },
];

export function buildDependencyGraph(resources: OciResource[]): DependencyGraph {
  const nodes: GraphNode[] = resources.map((r) => ({
    id: r.identifier,
    type: r.resourceType,
    name: r.displayName,
  }));
  const present = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = [];
  const dangling = new Set<string>();

  for (const r of resources) {
    const attrs = r.attributes ?? {};
    for (const { field, relation } of REFERENCE_FIELDS) {
      const value = attrs[field];
      const targets = Array.isArray(value) ? value : value ? [value] : [];
      for (const target of targets) {
        if (typeof target !== "string") continue;
        edges.push({ from: r.identifier, to: target, relation });
        if (!present.has(target)) dangling.add(target);
      }
    }
  }

  return { nodes, edges, danglingReferences: [...dangling] };
}

/**
 * Topological-ish provisioning order (dependencies first). Falls back to input
 * order for cycles rather than throwing, since OCI graphs can contain cycles
 * (e.g. security rules referencing each other).
 */
export function provisioningOrder(graph: DependencyGraph): string[] {
  const present = new Set(graph.nodes.map((n) => n.id));
  const deps = new Map<string, Set<string>>();
  for (const n of graph.nodes) deps.set(n.id, new Set());
  for (const e of graph.edges) {
    if (present.has(e.to)) deps.get(e.from)!.add(e.to);
  }

  const ordered: string[] = [];
  const placed = new Set<string>();
  // Repeatedly place nodes whose dependencies are all already placed.
  let progress = true;
  while (ordered.length < graph.nodes.length && progress) {
    progress = false;
    for (const n of graph.nodes) {
      if (placed.has(n.id)) continue;
      const d = deps.get(n.id)!;
      if ([...d].every((x) => placed.has(x))) {
        ordered.push(n.id);
        placed.add(n.id);
        progress = true;
      }
    }
  }
  // Any remaining nodes are in cycles; append in input order.
  for (const n of graph.nodes) if (!placed.has(n.id)) ordered.push(n.id);
  return ordered;
}
