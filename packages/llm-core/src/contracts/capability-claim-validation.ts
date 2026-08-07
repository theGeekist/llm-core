import type { CapabilityClaim, CapabilityConstraint, ConformanceEvidence } from "./capabilities.js";
import type { NativeExtensions } from "./extensions.js";
import { hasOnlyKeys, isPortableRecord } from "../shared/portable-data";

export interface CapabilityClaimValidators {
  readonly isCapabilityId: (value: unknown) => boolean;
  readonly isContractVersion: (value: unknown) => boolean;
  readonly isEvidence: (value: unknown) => value is ConformanceEvidence;
  readonly isConstraint: (value: unknown) => value is CapabilityConstraint;
  readonly isExtensions: (value: unknown) => value is NativeExtensions;
}

const CLAIM_REQUIRED_KEYS = ["capabilityId", "version", "status", "evidence"] as const;
const CLAIM_OPTIONAL_KEYS = ["additionalEvidence", "extensions"] as const;

const evidenceForClaim = (claim: CapabilityClaim): readonly ConformanceEvidence[] => [
  claim.evidence,
  ...(claim.additionalEvidence ?? []),
];

/**
 * Canonical closed-shape validation for a capability claim.
 *
 * Evidence authenticity and feature-specific identifier/extension policy stay
 * with the caller; status/evidence consistency and closed object structure do
 * not.
 */
const validateCapabilityClaim = (
  value: unknown,
  validators: CapabilityClaimValidators,
): value is CapabilityClaim => {
  if (
    !isPortableRecord(value) ||
    !validators.isCapabilityId(value.capabilityId) ||
    !validators.isContractVersion(value.version) ||
    !validators.isEvidence(value.evidence) ||
    (value.extensions !== undefined && !validators.isExtensions(value.extensions)) ||
    (value.additionalEvidence !== undefined &&
      (!Array.isArray(value.additionalEvidence) ||
        !value.additionalEvidence.every(validators.isEvidence)))
  ) {
    return false;
  }

  const claim = value as unknown as CapabilityClaim;
  const evidence = evidenceForClaim(claim);
  switch (value.status) {
    case "supported":
      return (
        hasOnlyKeys(value, CLAIM_REQUIRED_KEYS, CLAIM_OPTIONAL_KEYS) &&
        evidence.every((entry) => entry.result === "pass")
      );
    case "conditional":
      return (
        hasOnlyKeys(value, [...CLAIM_REQUIRED_KEYS, "conditions"], CLAIM_OPTIONAL_KEYS) &&
        Array.isArray(value.conditions) &&
        value.conditions.length > 0 &&
        value.conditions.every(validators.isConstraint) &&
        evidence.every((entry) => entry.result === "pass" || entry.result === "partial")
      );
    case "unsupported":
      return (
        hasOnlyKeys(value, CLAIM_REQUIRED_KEYS, CLAIM_OPTIONAL_KEYS) &&
        evidence.every((entry) => entry.result === "fail")
      );
    default:
      return false;
  }
};

export const isCapabilityClaim = (
  value: unknown,
  validators: CapabilityClaimValidators,
): value is CapabilityClaim => {
  try {
    return validateCapabilityClaim(value, validators);
  } catch {
    return false;
  }
};
