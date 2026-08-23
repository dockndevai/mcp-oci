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
  private readonly provider: common.AuthenticationDetailsProvider;
  private readonly identity: IdentityClient;
  private readonly search: ResourceSearchClient;
  private readonly compute: ComputeClient;
  private readonly network: VirtualNetworkClient;
  readonly region: string;

  /** Async because instance-principal auth resolves over the network. */
  static async create(conn: OciConnection): Promise<OciClient> {
    const provider: common.AuthenticationDetailsProvider =
      conn.auth === "instance_principal"
        ? await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build()
        : new common.ConfigFileAuthenticationDetailsProvider(conn.configFilePath, conn.profile);
    return new OciClient(provider, conn);
  }

  private constructor(provider: common.AuthenticationDetailsProvider, conn: OciConnection) {
    this.provider = provider;
    const auth = { authenticationDetailsProvider: this.provider };
    this.identity = new IdentityClient(auth);
    this.search = new ResourceSearchClient(auth);
    this.compute = new ComputeClient(auth);
    this.network = new VirtualNetworkClient(auth);

    if (conn.region) {
      const region = common.Region.fromRegionId(conn.region);
      this.identity.region = region;
      this.search.region = region;
      this.compute.region = region;
      this.network.region = region;
      this.region = conn.region;
    } else {
      this.region =
        (this.provider as unknown as { getRegion?: () => { regionId: string } }).getRegion?.()
          ?.regionId ?? "unknown";
    }
  }

  /** Tenancy OCID from the auth provider (root compartment). */
  tenancyId(): string {
    return (this.provider as unknown as { getTenantId: () => string }).getTenantId();
  }

  async listCompartments(rootId?: string) {
    const res = await this.identity.listCompartments({
      compartmentId: rootId ?? this.tenancyId(),
      compartmentIdInSubtree: true,
      accessLevel: "ANY",
    } as Parameters<IdentityClient["listCompartments"]>[0]);
    return res.items;
  }

  async listRegions() {
    const res = await this.identity.listRegionSubscriptions({ tenancyId: this.tenancyId() });
    return res.items;
  }

  /** Free-text or structured Resource Search across the tenancy. */
  async searchResources(query: string, structured = true) {
    const details = structured
      ? ({ type: "Structured", query } as rsModels.StructuredSearchDetails)
      : ({ type: "FreeText", text: query } as rsModels.FreeTextSearchDetails);
    const res = await this.search.searchResources({ searchDetails: details });
    return res.resourceSummaryCollection.items ?? [];
  }

  /** List every resource in a compartment via Resource Search. */
  async listCompartmentResources(compartmentId: string) {
    const query = `query all resources where compartmentId = '${compartmentId}'`;
    return this.searchResources(query, true);
  }

  /** Fetch detailed attributes for a resource, routed by type. Returns a normalised OciResource. */
  async getResourceDetails(resourceType: string, ocid: string, compartmentId?: string): Promise<OciResource> {
    let attributes: Record<string, unknown> = {};
    let displayName: string | undefined;
    switch (resourceType) {
      case "Vcn": {
        const r = await this.network.getVcn({ vcnId: ocid });
        attributes = r.vcn as unknown as Record<string, unknown>;
        displayName = r.vcn.displayName;
        break;
      }
      case "Subnet": {
        const r = await this.network.getSubnet({ subnetId: ocid });
        attributes = r.subnet as unknown as Record<string, unknown>;
        displayName = r.subnet.displayName;
        break;
      }
      case "Instance": {
        const r = await this.compute.getInstance({ instanceId: ocid });
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
