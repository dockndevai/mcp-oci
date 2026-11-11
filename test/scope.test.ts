import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/redact.js";
import { SecurityPolicy, type SecurityConfig } from "../src/security.js";
import { discoveryTools } from "../src/tools/discovery.js";
import { terraformTools } from "../src/tools/terraform.js";
import { assertOcid } from "../src/scope.js";

const ALLOWED = "ocid1.compartment.oc1..allowed";
const OTHER = "ocid1.compartment.oc1..other";

function policy(overrides: Partial<SecurityConfig> = {}): SecurityPolicy {
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

/** A fake OciClient exposing only what the tools under test call. */
function fakeClient() {
  return {
    region: "us-ashburn-1",
    searchResources: async () => [
      { resourceType: "Instance", identifier: "ocid1.instance.oc1..a", displayName: "a", compartmentId: ALLOWED, lifecycleState: "RUNNING" },
      { resourceType: "Instance", identifier: "ocid1.instance.oc1..b", displayName: "b", compartmentId: OTHER, lifecycleState: "RUNNING" },
      { resourceType: "Instance", identifier: "ocid1.instance.oc1..c", displayName: "c", lifecycleState: "RUNNING" },
    ],
    listCompartments: async () => [
      { id: ALLOWED, name: "prod", description: "", lifecycleState: "ACTIVE" },
      { id: OTHER, name: "secret-lab", description: "", lifecycleState: "ACTIVE" },
    ],
    getResourceDetails: async (resourceType: string, ocid: string, compartmentId?: string) => ({
      resourceType,
      identifier: ocid,
      compartmentId,
      // the resource's REAL compartment — independent of what the caller claimed
      attributes: { compartmentId: ocid.includes("..a") ? ALLOWED : OTHER, displayName: "x" },
    }),
  } as never;
}

const tool = (name: string) => [...discoveryTools, ...terraformTools].find((t) => t.name === name)!;
const run = (name: string, args: Record<string, unknown>, p: SecurityPolicy) => tool(name).handler(args, { client: fakeClient(), policy: p });
const text = (r: { content: Array<{ text: string }> }) => r.content[0].text;

describe("search_resources honours the compartment allowlist", () => {
  it("returns everything when no allowlist is set", async () => {
    const out = JSON.parse(text((await run("search_resources", { query: "query all resources" }, policy())) as never));
    expect(out).toHaveLength(3);
  });

  it("drops results from other compartments, and results whose compartment is unknown", async () => {
    const out = JSON.parse(text((await run("search_resources", { query: "query all resources" }, policy({ compartmentAllowlist: [ALLOWED] }))) as never));
    expect(out.map((r: { displayName: string }) => r.displayName)).toEqual(["a"]);
  });

  it("resolves compartment NAMES in the allowlist to OCIDs", async () => {
    const out = JSON.parse(text((await run("search_resources", { query: "q" }, policy({ compartmentAllowlist: ["prod"] }))) as never));
    expect(out.map((r: { displayName: string }) => r.displayName)).toEqual(["a"]);
  });
});

describe("get_resource / generate_terraform check the resource's REAL compartment", () => {
  const inAllowed = "ocid1.instance.oc1..a";
  const inOther = "ocid1.instance.oc1..zzz";

  it("allows a resource that is in an allowlisted compartment", async () => {
    const r = await run("get_resource", { resourceType: "Instance", ocid: inAllowed }, policy({ compartmentAllowlist: [ALLOWED] }));
    expect(text(r as never)).toContain(inAllowed);
  });

  it("refuses a resource in another compartment when the caller omits compartmentId", async () => {
    await expect(run("get_resource", { resourceType: "Instance", ocid: inOther }, policy({ compartmentAllowlist: [ALLOWED] }))).rejects.toThrow(/not in the configured allowlist/);
  });

  it("refuses it even when the caller CLAIMS an allowlisted compartment (the old bypass)", async () => {
    await expect(
      run("get_resource", { resourceType: "Instance", ocid: inOther, compartmentId: ALLOWED }, policy({ compartmentAllowlist: [ALLOWED] })),
    ).rejects.toThrow(/not in the configured allowlist/);
    await expect(
      run("generate_terraform", { resourceType: "Instance", ocid: inOther, compartmentId: ALLOWED }, policy({ compartmentAllowlist: [ALLOWED] })),
    ).rejects.toThrow(/not in the configured allowlist/);
  });

  it("is unchanged when no allowlist is set", async () => {
    const r = await run("get_resource", { resourceType: "Instance", ocid: inOther }, policy());
    expect(text(r as never)).toContain(inOther);
  });
});

describe("assertOcid", () => {
  it("accepts OCIDs and rejects query-injection attempts", () => {
    expect(assertOcid(ALLOWED)).toBe(ALLOWED);
    expect(() => assertOcid("x' or compartmentId = 'ocid1.compartment.oc1..other")).toThrow(/not a valid/);
    expect(() => assertOcid("")).toThrow();
  });
});

describe("redactSecrets", () => {
  it("redacts a secret-named key whole, even when it holds an object or array", () => {
    const out = redactSecrets({
      displayName: "ok",
      privateKey: { value: "-----BEGIN", fingerprint: "aa" },
      tokens: ["a", "b"],
      nested: { password: "p", keep: 1 },
    });
    expect(out).toEqual({ displayName: "ok", privateKey: "***REDACTED***", tokens: "***REDACTED***", nested: { password: "***REDACTED***", keep: 1 } });
  });
});
