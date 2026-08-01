import { isContractVersion, isExternalId, type ContractVersion } from "#contracts";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "#shared/portable-data";
import type { ModelProfile } from "./profile";
import type { DeploymentRef, ModelProfileId, ModelRef, ProviderRef } from "./references";

/**
 * Immutable identity of the binding selected for one model invocation.
 *
 * This is deliberately identity-only: it preserves the resolved model,
 * provider, deployment, and versioned profile without copying capability
 * claims, native extensions, credentials, or a live provider client.
 */
export interface ResolvedModelIdentity {
  readonly model: ModelRef;
  readonly provider: ProviderRef;
  readonly deployment: DeploymentRef;
  readonly profileId: ModelProfileId;
  readonly profileVersion: ContractVersion;
}

export type ResolvedModelIdentityInput = ResolvedModelIdentity;

const identityFrom = (value: unknown): ResolvedModelIdentity | null => {
  if (
    !isPortableRecord(value) ||
    !hasOnlyKeys(value, ["model", "provider", "deployment", "profileId", "profileVersion"]) ||
    !isExternalId(value.model) ||
    !isExternalId(value.provider) ||
    !isExternalId(value.deployment) ||
    !isExternalId(value.profileId) ||
    !isContractVersion(value.profileVersion)
  ) {
    return null;
  }
  return {
    model: value.model as ModelRef,
    provider: value.provider as ProviderRef,
    deployment: value.deployment as DeploymentRef,
    profileId: value.profileId as ModelProfileId,
    profileVersion: value.profileVersion as ContractVersion,
  };
};

/**
 * Snapshot a resolved model identity before it is attached to durable evidence.
 */
export const createResolvedModelIdentity = (
  input: ResolvedModelIdentityInput,
): ResolvedModelIdentity => {
  const identity = identityFrom(input);
  if (identity === null) {
    throw new TypeError("Resolved model identity must be a closed, versioned portable record.");
  }
  return cloneFrozen(identity);
};

/**
 * Derive the portable resolved identity from the profile that backs a live
 * `Model`. The resulting identity remains data, never the profile's claims,
 * extensions, or provider client.
 */
export const resolvedModelIdentityFromProfile = (profile: ModelProfile): ResolvedModelIdentity =>
  createResolvedModelIdentity({
    model: profile.model,
    provider: profile.provider,
    deployment: profile.deployment,
    profileId: profile.profileId,
    profileVersion: profile.version,
  });
