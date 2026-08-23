/**
 * Security policy engine.
 *
 * Flags decide which tools are registered (capability vs. access mode) and
 * whether each individual call is allowed at runtime (compartment + region
 * scoping, provisioning gating, dry-run). Pure logic — fully unit-testable.
 *
 * Note: this server is discovery-first. All shipped tools are `read`. The
 * `write`/`admin` tiers and the apply gate exist so provisioning can be added
 * later without weakening the model.
 */

export type Capability = "read" | "write" | "admin";
export type AccessMode = "read-only" | "read-write" | "admin";

const MODE_RANK: Record<AccessMode, number> = {
  "read-only": 0,
  "read-write": 1,
  admin: 2,
};

const CAPABILITY_RANK: Record<Capability, number> = {
  read: 0,
  write: 1,
  admin: 2,
};

export interface SecurityConfig {
  mode: AccessMode;
  /** If set, only these compartments (OCID or name) are in scope. Empty = all. */
  compartmentAllowlist: string[];
  /** If set, only these regions may be targeted. Empty = the configured region only. */
  regionAllowlist: string[];
  /** Running `terraform apply` through the server requires this. Off by default. */
  allowApply: boolean;
  /** Validate + log provisioning intent without executing it. */
  dryRun: boolean;
  /** Emit a JSON audit line to stderr per guarded operation. */
  auditLog: boolean;
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export interface GuardContext {
  tool: string;
  capability: Capability;
  /** Compartment (OCID or name) the operation targets. */
  compartment?: string;
  /** Region the operation targets. */
  region?: string;
  /** Requires the terraform-apply opt-in. */
  requiresApply?: boolean;
}

export class SecurityPolicy {
  constructor(private readonly config: SecurityConfig) {}

  get mode(): AccessMode {
    return this.config.mode;
  }

  isCapabilityEnabled(capability: Capability): boolean {
    return CAPABILITY_RANK[capability] <= MODE_RANK[this.config.mode];
  }

  isCompartmentAllowed(compartment: string): boolean {
    if (this.config.compartmentAllowlist.length === 0) return true;
    return this.config.compartmentAllowlist.includes(compartment);
  }

  isRegionAllowed(region: string): boolean {
    if (this.config.regionAllowlist.length === 0) return true;
    return this.config.regionAllowlist.includes(region);
  }

  guard(ctx: GuardContext): { dryRun: boolean } {
    if (!this.isCapabilityEnabled(ctx.capability)) {
      this.audit(ctx, "DENY", `capability '${ctx.capability}' exceeds mode '${this.config.mode}'`);
      throw new PolicyError(
        `Operation '${ctx.tool}' requires '${ctx.capability}' access but the server runs in '${this.config.mode}' mode.`,
      );
    }

    if (ctx.region !== undefined && !this.isRegionAllowed(ctx.region)) {
      this.audit(ctx, "DENY", `region '${ctx.region}' not in allowlist`);
      throw new PolicyError(
        `Region '${ctx.region}' is not in the configured allowlist (OCI_REGION_ALLOWLIST).`,
      );
    }

    if (ctx.compartment !== undefined && !this.isCompartmentAllowed(ctx.compartment)) {
      this.audit(ctx, "DENY", `compartment '${ctx.compartment}' not in allowlist`);
      throw new PolicyError(
        `Compartment '${ctx.compartment}' is not in the configured allowlist (OCI_COMPARTMENT_ALLOWLIST).`,
      );
    }

    if (ctx.requiresApply && !this.config.allowApply) {
      this.audit(ctx, "DENY", "apply not enabled");
      throw new PolicyError(
        `Operation '${ctx.tool}' is disabled. Set OCI_ALLOW_APPLY=true to enable terraform apply.`,
      );
    }

    const dryRun = ctx.capability !== "read" && this.config.dryRun;
    this.audit(ctx, dryRun ? "DRY_RUN" : "ALLOW");
    return { dryRun };
  }

  private audit(ctx: GuardContext, decision: string, reason?: string): void {
    if (!this.config.auditLog) return;
    const line = {
      ts: new Date().toISOString(),
      audit: "oci-mcp",
      decision,
      tool: ctx.tool,
      capability: ctx.capability,
      compartment: ctx.compartment ?? null,
      region: ctx.region ?? null,
      ...(reason ? { reason } : {}),
    };
    process.stderr.write(`${JSON.stringify(line)}\n`);
  }
}
