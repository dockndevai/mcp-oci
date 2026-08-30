import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "./config.js";
import { OciClient } from "./oci/client.js";
import { PolicyError, SecurityPolicy } from "./security.js";
import { discoveryTools } from "./tools/discovery.js";
import { terraformTools } from "./tools/terraform.js";
import { annotationsFor } from "./tools/annotations.js";
import type { ToolContext, ToolDef } from "./tools/types.js";

export const ALL_TOOLS: ToolDef[] = [...discoveryTools, ...terraformTools];

export async function buildServer(
  config: AppConfig,
): Promise<{ server: McpServer; enabled: string[] }> {
  const policy = new SecurityPolicy(config.security);
  const client = await OciClient.create(config.connection);
  const ctx: ToolContext = { client, policy };

  const server = new McpServer({ name: "mcp-oci", version: "0.1.2" });

  const enabled: string[] = [];
  for (const tool of ALL_TOOLS) {
    if (!policy.isCapabilityEnabled(tool.capability)) continue;
    enabled.push(tool.name);
    server.registerTool(tool.name, { ...tool.config, annotations: annotationsFor(tool) }, async (args: Record<string, unknown>) => {
      try {
        return await tool.handler(args ?? {}, ctx);
      } catch (err) {
        return toErrorResult(err);
      }
    });
  }

  return { server, enabled };
}

function toErrorResult(err: unknown) {
  let message: string;
  if (err instanceof PolicyError) {
    message = `Policy denied: ${err.message}`;
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
