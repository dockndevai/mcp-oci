# mcp-oci

[![CI](https://github.com/dockndevai/mcp-oci/actions/workflows/ci.yml/badge.svg)](https://github.com/dockndevai/mcp-oci/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@dockndevai/mcp-oci)](https://www.npmjs.com/package/@dockndevai/mcp-oci)

A [Model Context Protocol](https://modelcontextprotocol.io) server for **Oracle Cloud Infrastructure (OCI)**. It gives an MCP-capable client (Claude Desktop, Claude Code, Cursor, Copilot, …) the ability to **discover live OCI resources, map how they relate, and generate reproducible Terraform** — with behaviour controlled entirely by flags.

Think of it as a Playwright-MCP for your cloud: instead of rebuilding infrastructure knowledge by hand, the model can ask *"show all VCNs in the prod compartment"* and *"generate Terraform for this compartment"* and get structured, secret-free answers.

## Features

- **Live discovery** — compartments, regions, and any resource via OCI Resource Search.
- **Terraform generation** — faithful HCL for known types (VCN, subnet, instance, bucket, compartment) and annotated skeletons for the rest; whole-compartment modules with provider variables.
- **Dependency graph** — nodes/edges plus a suggested provisioning order (dependencies first).
- **Secrets never reach the model** — every payload is redacted before return.
- **Security flags** — access modes, compartment/region allowlists, provisioning gate, dry-run, and JSON audit logging (see below).
- **Standard auth** — OCI config file (`~/.oci/config`) or instance principals. No credentials stored by the server.

## Security model

| Concern | Flag | Default | Effect |
| --- | --- | --- | --- |
| What can the server do? | `OCI_MODE` | `read-only` | All shipped tools are read-only. `read-write`/`admin` are reserved for future provisioning and currently expose no extra tools. |
| Which compartments are in scope? | `OCI_COMPARTMENT_ALLOWLIST` | *(all)* | When set, operations on other compartments are refused. |
| Which regions are reachable? | `OCI_REGION_ALLOWLIST` | *(configured region)* | When set, only these regions may be targeted. |
| Can it run `terraform apply`? | `OCI_ALLOW_APPLY` | `false` | Reserved gate for provisioning (not yet shipped). |
| Preview without executing | `OCI_DRY_RUN` | `false` | For future write tools: validate + log intent without executing. |
| Audit trail | `OCI_AUDIT_LOG` | `true` | Emits a JSON line to stderr per guarded operation. |
| Secret redaction | *(always on)* | — | Secret-shaped fields are replaced with `***REDACTED***` before any result is returned. |

## Tools

**Discovery** (read): `list_compartments`, `list_regions`, `search_resources`, `list_compartment_resources`, `get_resource`

**Terraform** (read): `generate_terraform`, `generate_compartment_terraform`, `build_dependency_graph`

## Quickstart — add to your agent

Published on npm as [`@dockndevai/mcp-oci`](https://www.npmjs.com/package/@dockndevai/mcp-oci). No clone or build needed — your MCP client runs it on demand with `npx`. **Start in `read-only` mode**; see [`.env.example`](.env.example) for every variable and [docs/CLIENTS.md](docs/CLIENTS.md) for the full per-client guide.

**Claude Code** (CLI)

```bash
claude mcp add oci -e OCI_PROFILE="DEFAULT" -e OCI_MODE="read-only" -- npx -y @dockndevai/mcp-oci
```

**Claude Desktop · Cursor · Windsurf** — same block in `claude_desktop_config.json`, `.cursor/mcp.json`, or `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "oci": {
      "command": "npx",
      "args": [
        "-y",
        "@dockndevai/mcp-oci"
      ],
      "env": {
        "OCI_PROFILE": "DEFAULT",
        "OCI_MODE": "read-only"
      }
    }
  }
}
```

**OpenAI Codex CLI** — in `~/.codex/config.toml`:

```toml
[mcp_servers.oci]
command = "npx"
args = ["-y", "@dockndevai/mcp-oci"]
env = { OCI_PROFILE = "DEFAULT", OCI_MODE = "read-only" }
```

**VS Code (GitHub Copilot, Agent mode)** — in `.vscode/mcp.json`:

```json
{
  "servers": {
    "oci": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@dockndevai/mcp-oci"
      ],
      "env": {
        "OCI_PROFILE": "DEFAULT",
        "OCI_MODE": "read-only"
      }
    }
  }
}
```

## Configure

Point it at a standard OCI config profile. For safety, use an IAM user/policy with
read-only (`inspect`/`read`) permissions on the compartments you want the agent to see.

## Example prompts

- *"List all compartments, then show every resource in the `prod` compartment."*
- *"Generate Terraform for VCN `ocid1.vcn.oc1..…`."*
- *"Build a dependency graph for compartment `…` and tell me the provisioning order."*

## Run from source (development)

Prefer the published package above. To run from a clone:

```bash
npm install
npm run build
node dist/index.js   # with the environment variables set
```

## Develop

```bash
npm run dev        # watch mode
npm test           # security policy + terraform generation + graph + redaction
npm run typecheck
```

## Roadmap

- `terraform plan` / `apply` execution behind `read-write`/`admin` + `OCI_ALLOW_APPLY`.
- More resource-type mappers (load balancers, databases, DRGs, IAM policies).
- Cross-environment drift comparison.

## Publishing

This server ships a [`server.json`](server.json) for the official MCP registry and an [`mcpName`](package.json) for npm ownership validation. See **[PUBLISHING.md](PUBLISHING.md)** for publishing to npm and listing on the MCP registry, Smithery, Glama, Cursor, and PulseMCP.

## License

MIT
