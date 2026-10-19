# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.6] - 2026-10-19

### Changed
- Routine dependency/security maintenance. `npm audit --audit-level=high` reported 0
  vulnerabilities both before and after this pass (no high/critical advisories to fix).
- Took safe in-range patch bumps: `oci-common`/`oci-core`/`oci-identity`/`oci-resourcesearch`
  ^2.100.0 → ^2.143.0, `zod` ^4.5.4 → ^4.6.7, `vitest` ^5.0.0 → ^5.0.5.
- No direct dependency crossed a major version boundary; `npm run typecheck`, `npm run build`,
  and `npm test` all pass; final `npm audit` is clean.

## [0.1.5] - 2026-10-12

### Security
- Bump `@modelcontextprotocol/sdk` to ^1.32.1, clearing the OAuth-client advisory (GHSA-6qxp-vccf-f47h) along with transitive `fast-uri`, `ip-address`, `proxy-addr`, and `source-map-js` advisories; `npm audit` now reports 0 vulnerabilities.

### Changed
- Routine in-range dependency refresh: `@types/node`, `oci-common`/`oci-core`/`oci-identity`/`oci-resourcesearch`, `tsx`, `vitest`, and `zod` to their latest in-range versions.

## [0.1.4] - 2026-09-12

### Changed
- Bring dependencies and CI to current majors: `zod` ^4, TypeScript ^7, `@types/node` ^26, `tsx` ^4.23, and GitHub Actions (checkout v7, setup-node v7, action-gh-release v3, gitleaks v3, codeql-action v4). Clears the open Dependabot updates; `npm audit` reports 0 vulnerabilities.

## [0.1.3] - 2026-09-09

### Changed
- Require **Node 22** (previously Node 20); the updated dependency tree needs Node ≥ 22.19. CI and release workflows, the Dockerfile base image, and `engines` were updated.
- Bump the test runner `vitest` to ^5.0.0.

### Security
- Refresh the dependency tree to clear the moderate `hono` and `qs` advisories (transitive via the MCP SDK's HTTP transport, unused by this stdio server) and the `vitest` advisory; `npm audit` now reports **0 vulnerabilities**.

## [0.1.2] - 2026-08-30

### Changed
- Bump `@modelcontextprotocol/sdk` to ^1.30.0 to clear known dependency advisories flagged by supply-chain scanners.

## [0.1.1] - 2026-08-28

### Added
- MCP **tool annotations** on every tool (`readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint`), derived from each tool's access
  capability. Hosts can now reason about a tool's safety from structured
  metadata instead of parsing the description — read tools are advertised as
  read-only and non-destructive, admin/destructive tools as mutating.
- A test that keeps the annotations consistent with each tool's capability.

## [0.1.0]

### Added
- Initial release.
