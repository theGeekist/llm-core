import type { CapabilityClaim, ContractVersion, NativeExtensions, SchemaRef } from "#contracts";
import type { DeploymentRef, ModelProfileId, ModelRef, ProviderRef } from "./references";

/**
 * An immutable, versioned profile for a specific provider/model/deployment
 * (ADR-004). Capability claims are the contracts' evidence-backed claims, so
 * every asserted behavior cites versioned conformance provenance.
 */
export interface ModelProfile {
  profileId: ModelProfileId;
  version: ContractVersion;
  model: ModelRef;
  provider: ProviderRef;
  deployment: DeploymentRef;
  claims: CapabilityClaim[];
  schema?: SchemaRef;
  extensions?: NativeExtensions;
}
