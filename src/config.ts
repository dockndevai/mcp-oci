/**
 * Configuration from environment variables. OCI credentials come from a
 * standard OCI config file (~/.oci/config) or instance/resource principals.
 */
import type { AccessMode, SecurityConfig } from "./security.js";

export interface OciConnection {
  /** Auth strategy. */
  auth: "config_file" | "instance_principal";
  /** Path to the OCI config file (config_file auth). Empty = ~/.oci/config. */
  configFilePath?: string;
  /** Profile within the config file. Empty = DEFAULT. */
  profile: string;
  /** Override the region from the profile (must pass the region allowlist). */
  region?: string;
}

export interface AppConfig {
  connection: OciConnection;
  security: SecurityConfig;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function list(name: string): string[] {
  const v = process.env[name];
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseMode(): AccessMode {
  const raw = (process.env.OCI_MODE ?? "read-only").toLowerCase();
  if (raw === "read-only" || raw === "read-write" || raw === "admin") return raw;
  throw new Error(`Invalid OCI_MODE '${raw}'. Expected one of: read-only, read-write, admin.`);
}

export function loadConfig(): AppConfig {
  const auth = bool("OCI_INSTANCE_PRINCIPAL", false) ? "instance_principal" : "config_file";
  return {
    connection: {
      auth,
      configFilePath: process.env.OCI_CONFIG_FILE || undefined,
      profile: process.env.OCI_PROFILE || "DEFAULT",
      region: process.env.OCI_REGION || undefined,
    },
    security: {
      mode: parseMode(),
      compartmentAllowlist: list("OCI_COMPARTMENT_ALLOWLIST"),
      regionAllowlist: list("OCI_REGION_ALLOWLIST"),
      allowApply: bool("OCI_ALLOW_APPLY", false),
      dryRun: bool("OCI_DRY_RUN", false),
      auditLog: bool("OCI_AUDIT_LOG", true),
    },
  };
}
