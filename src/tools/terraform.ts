import { z } from "zod";
import { redactSecrets } from "../redact.js";
import { generateModule, generateTerraform, type OciResource } from "../terraform/generate.js";
import { buildDependencyGraph, provisioningOrder } from "../terraform/graph.js";
import type { ToolDef } from "./types.js";
import { jsonResult, textResult } from "./types.js";

/** Terraform + graph tools. Generation is read-only and safe (no cluster mutation). */
export const terraformTools: ToolDef[] = [
  {
    name: "generate_terraform",
    capability: "read",
    config: {
      title: "Generate Terraform for a resource",
      description:
        "Generate a Terraform (HCL) resource block for a single OCI resource by type and OCID. " +
        "Fetches the resource's attributes and maps them to the matching oci_* resource.",
      inputSchema: {
        resourceType: z.string().describe("OCI resource type, e.g. Vcn, Subnet, Instance"),
        ocid: z.string().describe("The resource OCID"),
        compartmentId: z.string().optional().describe("Compartment OCID (for scoping)"),
      },
    },
    handler: async (args, { client, policy }) => {
      const compartmentId = args.compartmentId as string | undefined;
      policy.guard({
        tool: "generate_terraform",
        capability: "read",
        compartment: compartmentId,
        region: client.region,
      });
      const resource = await client.getResourceDetails(
        args.resourceType as string,
        args.ocid as string,
        compartmentId,
      );
      const { hcl, recognized } = generateTerraform(redactSecrets(resource));
      return { content: [{ type: "text" as const, text: hcl }], recognized };
    },
  },
  {
    name: "generate_compartment_terraform",
    capability: "read",
    config: {
      title: "Generate Terraform for a whole compartment",
      description:
        "Discover every resource in a compartment and emit a Terraform module (provider variables + " +
        "one block per resource) to reproduce it. Unrecognised types become annotated skeletons.",
      inputSchema: { compartmentId: z.string().describe("Compartment OCID") },
    },
    handler: async (args, { client, policy }) => {
      const compartmentId = args.compartmentId as string;
      policy.guard({
        tool: "generate_compartment_terraform",
        capability: "read",
        compartment: compartmentId,
        region: client.region,
      });
      const summaries = await client.listCompartmentResources(compartmentId);
      // Enrich known types with full attributes so the HCL is faithful.
      const resources: OciResource[] = [];
      for (const s of summaries) {
        if (!s.identifier || !s.resourceType) continue;
        try {
          resources.push(
            await client.getResourceDetails(s.resourceType, s.identifier, s.compartmentId ?? compartmentId),
          );
        } catch {
          resources.push({
            resourceType: s.resourceType,
            identifier: s.identifier,
            displayName: s.displayName,
            compartmentId: s.compartmentId ?? compartmentId,
          });
        }
      }
      const hcl = generateModule(resources.map((r) => redactSecrets(r)));
      return textResult(hcl);
    },
  },
  {
    name: "build_dependency_graph",
    capability: "read",
    config: {
      title: "Build a resource dependency graph",
      description:
        "Discover a compartment's resources and return a node/edge dependency graph plus a suggested " +
        "provisioning order (dependencies first).",
      inputSchema: { compartmentId: z.string().describe("Compartment OCID") },
    },
    handler: async (args, { client, policy }) => {
      const compartmentId = args.compartmentId as string;
      policy.guard({
        tool: "build_dependency_graph",
        capability: "read",
        compartment: compartmentId,
        region: client.region,
      });
      const summaries = await client.listCompartmentResources(compartmentId);
      const resources: OciResource[] = [];
      for (const s of summaries) {
        if (!s.identifier || !s.resourceType) continue;
        try {
          resources.push(
            await client.getResourceDetails(s.resourceType, s.identifier, s.compartmentId ?? compartmentId),
          );
        } catch {
          resources.push({
            resourceType: s.resourceType,
            identifier: s.identifier,
            displayName: s.displayName,
          });
        }
      }
      const graph = buildDependencyGraph(resources);
      return jsonResult({ ...graph, provisioningOrder: provisioningOrder(graph) });
    },
  },
];
