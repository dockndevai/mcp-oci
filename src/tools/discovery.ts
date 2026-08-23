import { z } from "zod";
import { redactSecrets } from "../redact.js";
import type { ToolDef } from "./types.js";
import { jsonResult } from "./types.js";

/** Discovery tools — all read capability. Every payload is secret-redacted. */
export const discoveryTools: ToolDef[] = [
  {
    name: "list_compartments",
    capability: "read",
    config: {
      title: "List compartments",
      description:
        "List compartments in the tenancy (recursively). Compartments outside the allowlist are filtered out.",
      inputSchema: {
        rootCompartmentId: z
          .string()
          .optional()
          .describe("OCID to list under (defaults to the tenancy root)"),
      },
    },
    handler: async (args, { client, policy }) => {
      policy.guard({ tool: "list_compartments", capability: "read", region: client.region });
      const items = await client.listCompartments(args.rootCompartmentId as string | undefined);
      const filtered = (items ?? [])
        .filter((c) => policy.isCompartmentAllowed(c.id) || policy.isCompartmentAllowed(c.name))
        .map((c) => ({ id: c.id, name: c.name, description: c.description, lifecycleState: c.lifecycleState }));
      return jsonResult(filtered);
    },
  },
  {
    name: "list_regions",
    capability: "read",
    config: {
      title: "List subscribed regions",
      description: "List the regions this tenancy is subscribed to.",
      inputSchema: {},
    },
    handler: async (_args, { client, policy }) => {
      policy.guard({ tool: "list_regions", capability: "read" });
      const items = await client.listRegions();
      const regions = (items ?? [])
        .map((r) => ({ regionName: r.regionName, status: r.status, isHomeRegion: r.isHomeRegion }))
        .filter((r) => !r.regionName || policy.isRegionAllowed(r.regionName));
      return jsonResult(regions);
    },
  },
  {
    name: "search_resources",
    capability: "read",
    config: {
      title: "Search resources",
      description:
        "Search tenancy resources using OCI Resource Search. Provide either a structured query " +
        "(e.g. \"query instance resources where displayName =~ 'prod'\") or free text.",
      inputSchema: {
        query: z.string().describe("Structured query or free-text search string"),
        freeText: z.boolean().optional().describe("Treat query as free text instead of a structured query"),
      },
    },
    handler: async (args, { client, policy }) => {
      policy.guard({ tool: "search_resources", capability: "read", region: client.region });
      const items = await client.searchResources(
        args.query as string,
        !(args.freeText as boolean | undefined),
      );
      const summarized = items.map((r) => ({
        resourceType: r.resourceType,
        identifier: r.identifier,
        displayName: r.displayName,
        compartmentId: r.compartmentId,
        lifecycleState: r.lifecycleState,
      }));
      return jsonResult(redactSecrets(summarized));
    },
  },
  {
    name: "list_compartment_resources",
    capability: "read",
    config: {
      title: "List all resources in a compartment",
      description: "Enumerate every resource in a compartment (via Resource Search).",
      inputSchema: { compartmentId: z.string().describe("Compartment OCID") },
    },
    handler: async (args, { client, policy }) => {
      const compartmentId = args.compartmentId as string;
      policy.guard({
        tool: "list_compartment_resources",
        capability: "read",
        compartment: compartmentId,
        region: client.region,
      });
      const items = await client.listCompartmentResources(compartmentId);
      const summarized = items.map((r) => ({
        resourceType: r.resourceType,
        identifier: r.identifier,
        displayName: r.displayName,
        lifecycleState: r.lifecycleState,
      }));
      return jsonResult(redactSecrets(summarized));
    },
  },
  {
    name: "get_resource",
    capability: "read",
    config: {
      title: "Get resource details",
      description:
        "Fetch detailed attributes for a resource by type and OCID. Known types (Vcn, Subnet, Instance) " +
        "return full attributes; others return the identifier. Secrets are redacted.",
      inputSchema: {
        resourceType: z.string().describe("OCI resource type, e.g. Vcn, Subnet, Instance"),
        ocid: z.string().describe("The resource OCID"),
        compartmentId: z.string().optional().describe("Compartment OCID (for scoping)"),
      },
    },
    handler: async (args, { client, policy }) => {
      const compartmentId = args.compartmentId as string | undefined;
      policy.guard({
        tool: "get_resource",
        capability: "read",
        compartment: compartmentId,
        region: client.region,
      });
      const resource = await client.getResourceDetails(
        args.resourceType as string,
        args.ocid as string,
        compartmentId,
      );
      return jsonResult(redactSecrets(resource));
    },
  },
];
