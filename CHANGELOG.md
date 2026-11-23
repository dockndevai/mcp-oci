# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.12] - 2026-11-23

### Changed
- Bumped `oci-common`, `oci-core`, `oci-identity`, `oci-resourcesearch` from 2.146.0 to 2.147.0 (minor, within existing `^2.145.0` range).
- Bumped `vitest` from 5.1.0 to 5.1.1 (patch, within existing `^5.1.0` range).
- `npm audit` reports 2 moderate advisories (GHSA-qv5m-9pm6-hqp3, GHSA-jpvv-r467-5p4w in `@hono/node-server`; GHSA-4m76-xfj5-7975, GHSA-h7mg-cq63-vhpq, GHSA-3gg2-335m-rxc6, GHSA-46wx-v44x-9hh2, GHSA-4h7h-rv7c-7m2v in `hono`) with no high/critical findings; left as-is since none reach the high/critical threshold for this maintenance pass.

## [0.1.11] - 2026-11-16

### Changed
- Routine dependency/security maintenance. `npm audit --audit-level=high` reported 0
  vulnerabilities before and after this pass (two pre-existing moderate `hono` /
  `@hono/node-server` advisories remain, below the `--audit-level=high` threshold).
- Took safe in-range patch bumps: `oci-common`, `oci-core`, `oci-identity`,
  `oci-resourcesearch` 2.145.0 → 2.146.0. No direct dependency crossed a major version
  boundary; `npm run typecheck`, `npm run build`, and `npm test` all pass.

## [0.1.10] - 2026-11-11

### Security
- **`OCI_COMPARTMENT_ALLOWLIST` is now enforced on what is returned, not only on what the caller claims.**
  Previously the allowlist was checked against a `compartmentId` argument supplied by the caller, so with an
  allowlist set: `search_resources` (a free-form, tenancy-wide query) returned resources from every compartment,
  and `get_resource` / `generate_terraform` returned any resource by OCID when `compartmentId` was omitted or
  set to an allowlisted compartment. Now `search_resources` drops results whose real compartment is not
  allowlisted (allowlist entries may be OCIDs or compartment names), and `get_resource` / `generate_terraform`
  refuse a resource whose real compartment is outside the allowlist. Behaviour with no allowlist is unchanged.
- `compartmentId` is validated as an OCID before it is interpolated into the Resource Search query
  (hardening — the allowlist already exact-matched the raw string).
- Secret redaction now redacts a secret-named key **whole** when it holds an object or array; before, only
  primitive values under secret-shaped keys were replaced and structured values were walked.

## [0.1.9] - 2026-11-09

### Changed
- Routine dependency/security maintenance. `npm audit --audit-level=high` reported 0
  vulnerabilities before and after this pass.
- Took safe in-range patch/minor bumps: `oci-common`, `oci-core`, `oci-identity`,
  `oci-resourcesearch` 2.144.0 → 2.145.0; `vitest` 5.0.5 → 5.1.0 (dev dependency). No
  direct dependency crossed a major version boundary; `npm run typecheck`, `npm run build`,
  and `npm test` all pass; final `npm audit` is clean.

### Note
- v0.1.5–v0.1.8 are committed to `main` from prior maintenance passes but were never
  tagged/released — the npm registry's `latest` dist-tag is still 0.1.4 (latest git tag
  v0.1.4). Tagging/publishing is blocked for this automated session (pushing a `v*` tag is
  denied by the session's permission policy as "create public surface"); a human needs to
  push the release tag(s) to actually publish.

## [0.1.8] - 2026-11-02

### Changed
- Routine weekly dependency maintenance: `npm audit --audit-level=high` reported 0 advisories (no high/critical findings). Took the safe in-range patch bump for `@types/node` (26.6.5 → 26.6.6); no direct dependency crossed a major version boundary. `npm audit` reports 0 vulnerabilities after the bump.

## [0.1.7] - 2026-10-26

### Changed
- Routine weekly dependency maintenance: `npm audit --audit-level=high` flagged a high-severity `body-parser` DoS advisory (GHSA-27r3-jxmh-p828) and a moderate `fast-uri` advisory chain; resolved both via `npm audit fix` (transitive bumps `body-parser` 2.3.0 → 2.4.0, `fast-uri` 3.1.8 → 3.1.9, `qs` 6.16.0 → 6.16.1), no direct dependency crossed a major version. Took in-range patch bumps for `@modelcontextprotocol/sdk` (1.32.1 → 1.32.2) and `oci-common`/`oci-core`/`oci-identity`/`oci-resourcesearch` (2.143.0 → 2.144.0). `npm audit` reports 0 vulnerabilities after the bumps.

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
