#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`[oci-mcp] Configuration error: ${(err as Error).message}\n`);
    process.exit(1);
  }

  let built;
  try {
    built = await buildServer(config);
  } catch (err) {
    process.stderr.write(
      `[oci-mcp] Failed to initialise OCI client: ${(err as Error).message}\n` +
        "Check your OCI config file (~/.oci/config), OCI_PROFILE, or OCI_INSTANCE_PRINCIPAL.\n",
    );
    process.exit(1);
  }

  process.stderr.write(
    `[oci-mcp] Starting in '${config.security.mode}' mode` +
      `${config.security.dryRun ? " (DRY RUN)" : ""}. ` +
      `${built.enabled.length} tools enabled: ${built.enabled.join(", ")}\n`,
  );

  const transport = new StdioServerTransport();
  await built.server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[oci-mcp] Fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
