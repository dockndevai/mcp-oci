# Security

`mcp-oci` exposes Oracle Cloud discovery to an AI agent. Treat it like any other
privileged automation and grant it the least access it needs.

## Principles

- **Read-only and discovery-first.** Every shipped tool is read-only; it discovers
  resources and generates Terraform, but does not provision or delete anything.
- **Secrets never reach the model.** All resource payloads pass through a
  conservative redactor (`src/redact.ts`) that replaces the value of any
  secret-shaped field (`password`, `secret`, `token`, `privateKey`, `apiKey`, …)
  with `***REDACTED***` before returning. It over-redacts by design.
- **Scope with IAM, not just flags.** The flags are defence in depth; the primary
  control is the OCI user/policy the config profile authenticates as. Grant it
  read-only policies (e.g. `inspect`/`read`) on only the compartments you intend.
- **Pin the blast radius.** Use `OCI_COMPARTMENT_ALLOWLIST` and
  `OCI_REGION_ALLOWLIST` to constrain which compartments and regions are reachable.
- **Provisioning is gated and not yet shipped.** The `write`/`admin` modes and the
  `OCI_ALLOW_APPLY` flag exist so `terraform apply` can be added later behind an
  explicit opt-in. Until then those tiers expose no additional tools.
- **Keep the audit log on.** `OCI_AUDIT_LOG=true` (default) writes a JSON line per
  guarded operation to stderr.

## Handling of credentials

- Credentials come from your OCI config file (`~/.oci/config`) or instance
  principals; the server stores none of its own.
- Generated Terraform references sensitive values through `var.*` inputs rather
  than inlining them.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a
public issue.
