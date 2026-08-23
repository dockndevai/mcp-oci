/**
 * Secret redaction. A hard requirement: secrets must never reach the LLM.
 *
 * We walk any resource payload and replace the value of fields whose key looks
 * secret-shaped with a placeholder, before the data is returned as a tool
 * result. This is deliberately conservative — it over-redacts rather than risk
 * leaking a credential.
 */

const SECRET_KEY_PATTERN =
  /(secret|password|passphrase|privatekey|private_key|token|credential|apikey|api_key|sessionkey|session_key|access_?key|client_?secret|auth|pretsharedkey|pre_shared_key|sharedkey)/i;

const REDACTED = "***REDACTED***";

/** Deep-clone `value`, redacting the values of any secret-shaped keys. */
export function redactSecrets<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k) && v !== null && typeof v !== "object") {
        out[k] = REDACTED;
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  }
  return value;
}

/** Exposed for tests. */
export const _internal = { SECRET_KEY_PATTERN, REDACTED };
