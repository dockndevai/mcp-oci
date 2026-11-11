/**
 * Compartment-scope enforcement for tools that address resources by OCID or by free query.
 *
 * `SecurityPolicy.guard` can only check a compartment the caller *asserts*. Resource Search and
 * fetch-by-OCID return resources whose real compartment may differ from what was asserted (or that
 * was never asserted), so when `OCI_COMPARTMENT_ALLOWLIST` is set the real compartment of every
 * returned resource is checked here.
 */
import type { OciClient } from "./oci/client.js";
import { PolicyError, type SecurityPolicy } from "./security.js";

const OCID = /^ocid1\.[A-Za-z0-9_.-]+$/;

/** Reject anything that is not shaped like an OCID before it is interpolated into a search query. */
export function assertOcid(value: string, what = "OCID"): string {
  if (!OCID.test(value)) throw new PolicyError(`'${value.slice(0, 80)}' is not a valid ${what}.`);
  return value;
}

/**
 * The compartment OCIDs the allowlist permits, or `null` when no allowlist is configured.
 * Allowlist entries may be OCIDs or compartment names; names are resolved to OCIDs.
 */
export async function allowedCompartmentIds(client: OciClient, policy: SecurityPolicy): Promise<Set<string> | null> {
  const list = policy.compartmentAllowlist;
  if (list.length === 0) return null;
  const ids = new Set(list.filter((e) => OCID.test(e)));
  if (list.some((e) => !OCID.test(e))) {
    for (const c of (await client.listCompartments()) ?? []) {
      if (list.includes(c.name) || list.includes(c.id)) ids.add(c.id);
    }
  }
  return ids;
}

/** Keep only items whose real compartment is allowlisted (items with no compartment cannot be verified and are dropped). */
export async function filterToAllowedCompartments<T extends { compartmentId?: string }>(
  client: OciClient,
  policy: SecurityPolicy,
  tool: string,
  items: T[],
): Promise<T[]> {
  const allowed = await allowedCompartmentIds(client, policy);
  if (!allowed) return items;
  const kept = items.filter((i) => i.compartmentId !== undefined && allowed.has(i.compartmentId));
  if (kept.length !== items.length) policy.noteFiltered(tool, items.length - kept.length);
  return kept;
}

/** Refuse a fetched resource whose real compartment is outside the allowlist, whatever compartment the caller claimed. */
export async function assertResourceInScope(
  client: OciClient,
  policy: SecurityPolicy,
  tool: string,
  resource: { attributes?: Record<string, unknown> },
): Promise<void> {
  const actual = resource.attributes?.compartmentId;
  if (typeof actual !== "string") return; // unknown type: only the identifier is echoed, nothing was read
  const allowed = await allowedCompartmentIds(client, policy);
  if (allowed && !allowed.has(actual)) {
    policy.noteDenied(tool, actual);
    throw new PolicyError(`The resource is in compartment '${actual}', which is not in the configured allowlist (OCI_COMPARTMENT_ALLOWLIST).`);
  }
}
