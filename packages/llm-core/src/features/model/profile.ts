import type { CapabilityClaim, ContractVersion, NativeExtensions, SchemaRef } from "#contracts";
import type { DeploymentRef, ModelProfileId, ModelRef, ProviderRef } from "./references";

/**
 * An immutable, versioned profile for a specific provider/model/deployment
 * (ADR-004). Capability claims are the contracts' evidence-backed claims, so
 * every asserted behavior cites versioned conformance provenance.
 */
export interface ModelProfile {
  readonly profileId: ModelProfileId;
  readonly version: ContractVersion;
  readonly model: ModelRef;
  readonly provider: ProviderRef;
  readonly deployment: DeploymentRef;
  readonly claims: readonly CapabilityClaim[];
  readonly schema?: SchemaRef;
  readonly extensions?: NativeExtensions;
}
