import { isContractVersion } from "#contracts";
import type { CapabilityClaim, ContractVersion, NativeExtensions, SchemaRef } from "#contracts";
import { deepFreeze } from "./freeze";
import { isPortableId } from "./references";
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

declare const registeredModelProfileBrand: unique symbol;

/**
 * A profile that has passed {@link registerModelProfile}: validated, defensively
 * deep-cloned, and deep-frozen. Only registered profiles may back a binding, so
 * resolution evidence cannot be mutated through a caller-retained reference.
 */
export type RegisteredModelProfile = ModelProfile & {
  readonly [registeredModelProfileBrand]: "RegisteredModelProfile";
};

const CLAIM_STATUSES: ReadonlySet<string> = new Set(["supported", "conditional", "unsupported"]);

const validateProfile = (profile: ModelProfile): void => {
  if (
    !isPortableId(profile.profileId) ||
    !isPortableId(profile.model) ||
    !isPortableId(profile.provider) ||
    !isPortableId(profile.deployment)
  ) {
    throw new TypeError("ModelProfile references must be printable-ASCII identifiers.");
  }
  if (!isContractVersion(profile.version)) {
    throw new TypeError("ModelProfile.version must be a SemVer contract version.");
  }
  if (!Array.isArray(profile.claims)) {
    throw new TypeError("ModelProfile.claims must be an array.");
  }
  for (const claim of profile.claims) {
    if (
      typeof claim.capabilityId !== "string" ||
      !CLAIM_STATUSES.has(claim.status) ||
      !isContractVersion(claim.version) ||
      claim.evidence === undefined
    ) {
      throw new TypeError("ModelProfile.claims contains an invalid capability claim.");
    }
  }
};

/**
 * Validate, defensively deep-clone, and deep-freeze a profile so a binding can
 * trust it as immutable evidence. Mutating the source afterward cannot affect
 * the registered value.
 */
export const registerModelProfile = (profile: ModelProfile): RegisteredModelProfile => {
  validateProfile(profile);
  const copy = structuredClone(profile) as ModelProfile;
  return deepFreeze(copy) as RegisteredModelProfile;
};
