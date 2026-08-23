import { describe, expect, it } from "vitest";
import { PolicyError, SecurityPolicy, type SecurityConfig } from "../src/security.js";

function makePolicy(overrides: Partial<SecurityConfig> = {}): SecurityPolicy {
  return new SecurityPolicy({
    mode: "read-only",
    compartmentAllowlist: [],
    regionAllowlist: [],
    allowApply: false,
    dryRun: false,
    auditLog: false,
    ...overrides,
  });
}

describe("capability gating", () => {
  it("read-only enables read only", () => {
    const p = makePolicy();
    expect(p.isCapabilityEnabled("read")).toBe(true);
    expect(p.isCapabilityEnabled("write")).toBe(false);
    expect(p.isCapabilityEnabled("admin")).toBe(false);
  });
});

describe("compartment allowlist", () => {
  it("blocks compartments outside a non-empty allowlist", () => {
    const p = makePolicy({ compartmentAllowlist: ["ocid1.compartment.oc1..aaa"] });
    expect(() => p.guard({ tool: "get_resource", capability: "read", compartment: "ocid1.compartment.oc1..zzz" })).toThrow(
      /allowlist/,
    );
    expect(() =>
      p.guard({ tool: "get_resource", capability: "read", compartment: "ocid1.compartment.oc1..aaa" }),
    ).not.toThrow();
  });
});

describe("region allowlist", () => {
  it("blocks regions outside a non-empty allowlist", () => {
    const p = makePolicy({ regionAllowlist: ["us-ashburn-1"] });
    expect(() => p.guard({ tool: "search_resources", capability: "read", region: "eu-frankfurt-1" })).toThrow(
      /allowlist/,
    );
  });
});

describe("apply gating", () => {
  it("blocks apply without the opt-in even in admin mode", () => {
    const p = makePolicy({ mode: "admin", allowApply: false });
    expect(() =>
      p.guard({ tool: "terraform_apply", capability: "admin", requiresApply: true }),
    ).toThrow(/OCI_ALLOW_APPLY/);
  });

  it("permits apply when opted in", () => {
    const p = makePolicy({ mode: "admin", allowApply: true });
    expect(() =>
      p.guard({ tool: "terraform_apply", capability: "admin", requiresApply: true }),
    ).not.toThrow();
  });
});
