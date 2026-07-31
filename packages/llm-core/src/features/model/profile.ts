import type { CapabilityClaim, ContractVersion, NativeExtensions, SchemaRef } from "#contracts";
import { deepFreeze } from "./freeze";
import { validateModelProfileValue } from "./profile-validation";
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
 * A profile that has passed {@link createModelProfile}: fully validated,
 * defensively deep-cloned, and deep-frozen. Only registered profiles may back a
 * binding, so resolution evidence cannot be forged or mutated through a
 * caller-retained reference.
 */
export type RegisteredModelProfile = ModelProfile & {
  readonly [registeredModelProfileBrand]: "RegisteredModelProfile";
};

const registeredModelProfiles = new WeakSet<object>();

export const isRegisteredModelProfile = (value: unknown): value is RegisteredModelProfile =>
  typeof value === "object" && value !== null && registeredModelProfiles.has(value);

/**
 * Deep-clone, then fully validate the clone, then deep-freeze and brand it.
 *
 * Cloning first guarantees the validated value is exactly the branded value —
 * a getter on the source cannot return one shape to the validator and another
 * to callers. A non-cloneable source (functions, etc.) is rejected outright.
 */
export const createModelProfile = (profile: ModelProfile): ModelProfile => {
  let copy: ModelProfile;
  try {
    copy = structuredClone(profile);
  } catch {
    throw new TypeError("ModelProfile must be structured-cloneable portable data.");
  }
  validateModelProfileValue(copy);
  const registered = deepFreeze(copy) as RegisteredModelProfile;
  registeredModelProfiles.add(registered);
  return registered;
};
