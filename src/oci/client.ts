/**
 * Thin wrapper over the OCI SDK. Handles auth (config-file or instance
 * principal) and the discovery calls the tools need. Live calls require a real
 * tenancy; the pure Terraform/graph modules are tested independently.
 */
import * as common from "oci-common";
import { IdentityClient } from "oci-identity";
import { ComputeClient, VirtualNetworkClient } from "oci-core";
import { ResourceSearchClient, models as rsModels } from "oci-resourcesearch";
import type { OciConnection } from "../config.js";
import type { OciResource } from "../terraform/generate.js";

export class OciClient {
  private provider?: common.AuthenticationDetailsProvider;
  private identity?: IdentityClient;
  private search?: ResourceSearchClient;
  private compute?: ComputeClient;
  private network?: VirtualNetworkClient;
  region = "unknown";
  private readonly conn: OciConnection;

  /**
   * Never throws: the server must be able to start and advertise its tools
   * (introspection) even without ~/.oci/config. Auth is attempted here and,
   * if it fails, re-attempted on the first tool call (which then surfaces the error).
   */
  static async create(conn: OciConnection): Promise<OciClient> {
    const client = new OciClient(conn);
    try {
      await client.init();
    } catch (err) {
      process.stderr.write(
        `[oci-mcp] WARNING: OCI auth not ready (${(err as Error).message}); tool calls will fail until configured.\n`,
      );
    }
    return client;
  }

  private constructor(conn: OciConnection) {
    this.conn = conn;
    if (conn.region) this.region = conn.region;
  }

  private async init(): Promise<void> {
    const provider: common.AuthenticationDetailsProvider =
      this.conn.auth === "instance_principal"
        ? await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build()
        : new common.ConfigFileAuthenticationDetailsProvider(this.conn.configFilePath, this.conn.profile);
    this.provider = provider;
    const auth = { authenticationDetailsProvider: provider };
    this.identity = new IdentityClient(auth);
    this.search = new ResourceSearchClient(auth);
    this.compute = new ComputeClient(auth);
    this.network = new VirtualNetworkClient(auth);

    if (this.conn.region) {
      const region = common.Region.fromRegionId(this.conn.region);
      this.identity.region = region;
      this.search.region = region;
      this.compute.region = region;
      this.network.region = region;
      this.region = this.conn.region;
    } else {
      this.region =
        (provider as unknown as { getRegion?: () => { regionId: string } }).getRegion?.()?.regionId ?? "unknown";
    }
  }

  /** Ensure auth + clients are ready; throws a clear error if OCI isn't configured. */
  private async ready(): Promise<void> {
    if (!this.provider) await this.init();
  }

  /** Tenancy OCID from the auth provider (root compartment). */
  tenancyId(): string {
    return (this.provider as unknown as { getTenantId: () => string }).getTenantId();
  }

  async listCompartments(rootId?: string) {
    await this.ready();
    const res = await this.identity!.listCompartments({
      compartmentId: rootId ?? this.tenancyId(),
      compartmentIdInSubtree: true,
      accessLevel: "ANY",
    } as Parameters<IdentityClient["listCompartments"]>[0]);
    return res.items;
  }

  async listRegions() {
    await this.ready();
    const res = await this.identity!.listRegionSubscriptions({ tenancyId: this.tenancyId() });
    return res.items;
  }

  /** Free-text or structured Resource Search across the tenancy. */
  async searchResources(query: string, structured = true) {
    await this.ready();
    const details = structured
      ? ({ type: "Structured", query } as rsModels.StructuredSearchDetails)
      : ({ type: "FreeText", text: query } as rsModels.FreeTextSearchDetails);
    const res = await this.search!.searchResources({ searchDetails: details });
    return res.resourceSummaryCollection.items ?? [];
  }

  /** List every resource in a compartment via Resource Search. */
  async listCompartmentResources(compartmentId: string) {
    const query = `query all resources where compartmentId = '${compartmentId}'`;
    return this.searchResources(query, true);
  }

  /** Fetch detailed attributes for a resource, routed by type. Returns a normalised OciResource. */
  async getResourceDetails(resourceType: string, ocid: string, compartmentId?: string): Promise<OciResource> {
    await this.ready();
    let attributes: Record<string, unknown> = {};
    let displayName: string | undefined;
    switch (resourceType) {
      case "Vcn": {
        const r = await this.network!.getVcn({ vcnId: ocid });
        attributes = r.vcn as unknown as Record<string, unknown>;
        displayName = r.vcn.displayName;
        break;
      }
      case "Subnet": {
        const r = await this.network!.getSubnet({ subnetId: ocid });
        attributes = r.subnet as unknown as Record<string, unknown>;
        displayName = r.subnet.displayName;
        break;
      }
      case "Instance": {
        const r = await this.compute!.getInstance({ instanceId: ocid });
        attributes = r.instance as unknown as Record<string, unknown>;
        displayName = r.instance.displayName;
        break;
      }
      default:
        // Unknown type: return the identifier so the generator emits a skeleton.
        break;
    }
    return {
      resourceType,
      identifier: ocid,
      displayName,
      compartmentId,
      attributes,
    };
  }
}
