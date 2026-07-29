import {
  isCanonicalUuid,
  isContractVersion,
  isDigest,
  isExternalId,
  isJsonValue,
  isNativeExtensions,
  isSchemaRef,
} from "#contracts";
import type { ModelProfile } from "./profile";

/**
 * Deep structural validation for a profile before it is branded
 * `RegisteredModelProfile`. Runs on the already-cloned value so what is
 * validated is exactly what gets frozen and trusted by the resolver.
 *
 * Contract-owned shapes are checked with the contracts' own guards; only the
 * capability-id / media-type / date-time patterns (which expose no runtime
 * guard) are validated locally, inside this slice's write scope.
 */

// Reverse-DNS-ish capability id, mirroring src/contracts/capabilities.ts.
const CAPABILITY_ID =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MEDIA_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const EVIDENCE_KINDS: ReadonlySet<string> = new Set([
  "artifact",
  "checkpoint",
  "evaluation",
  "event-payload",
  "execution-receipt",
  "other",
  "tool-arguments",
  "tool-result",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCapabilityId = (value: unknown): boolean =>
  typeof value === "string" && CAPABILITY_ID.test(value);
const isImplementationId = (value: unknown): boolean =>
  typeof value === "string" && isExternalId(value);
const isDateTime = (value: unknown): boolean => typeof value === "string" && DATE_TIME.test(value);
const isMediaType = (value: unknown): boolean => typeof value === "string" && MEDIA_TYPE.test(value);
const isByteLength = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isResourceRef = (value: unknown): boolean =>
  isRecord(value) &&
  isCanonicalUuid(value.resourceId) &&
  isMediaType(value.mediaType) &&
  isByteLength(value.byteLength) &&
  isDigest(value.digest);

const isEvidenceRef = (value: unknown): boolean =>
  isRecord(value) &&
  isCanonicalUuid(value.evidenceId) &&
  typeof value.kind === "string" &&
  EVIDENCE_KINDS.has(value.kind) &&
  isResourceRef(value.content) &&
  (value.schema === undefined || isSchemaRef(value.schema));

const isConstraint = (value: unknown): boolean =>
  isRecord(value) && typeof value.name === "string" && isJsonValue(value.value);

const isConstraintList = (value: unknown, minItems: number): boolean =>
  Array.isArray(value) && value.length >= minItems && value.every(isConstraint);

const isEvidenceBase = (evidence: Record<string, unknown>): boolean =>
  isEvidenceRef(evidence.report) &&
  isCapabilityId(evidence.suiteId) &&
  isContractVersion(evidence.suiteVersion) &&
  isDateTime(evidence.observedAt) &&
  isImplementationId(evidence.implementationId) &&
  typeof evidence.implementationVersion === "string" &&
  (evidence.providerId === undefined || isImplementationId(evidence.providerId)) &&
  (evidence.providerVersion === undefined || typeof evidence.providerVersion === "string") &&
  (evidence.contractSchema === undefined || isSchemaRef(evidence.contractSchema)) &&
  (evidence.extensions === undefined || isNativeExtensions(evidence.extensions));

const isPassingEvidence = (value: unknown): boolean =>
  isRecord(value) && value.result === "pass" && isEvidenceBase(value);
const isPartialEvidence = (value: unknown): boolean =>
  isRecord(value) &&
  value.result === "partial" &&
  isEvidenceBase(value) &&
  isConstraintList(value.limitations, 1);
const isFailedEvidence = (value: unknown): boolean =>
  isRecord(value) &&
  value.result === "fail" &&
  isEvidenceBase(value) &&
  isConstraintList(value.failures, 1);
const isAnyEvidence = (value: unknown): boolean =>
  isPassingEvidence(value) || isPartialEvidence(value) || isFailedEvidence(value);

const isClaimBase = (claim: Record<string, unknown>): boolean =>
  isCapabilityId(claim.capabilityId) &&
  isContractVersion(claim.version) &&
  (claim.additionalEvidence === undefined ||
    (Array.isArray(claim.additionalEvidence) && claim.additionalEvidence.every(isAnyEvidence))) &&
  (claim.extensions === undefined || isNativeExtensions(claim.extensions));

const isValidClaim = (value: unknown): boolean => {
  if (!isRecord(value) || !isClaimBase(value)) {
    return false;
  }
  switch (value.status) {
    case "supported":
      return isPassingEvidence(value.evidence);
    case "conditional":
      return (
        (isPassingEvidence(value.evidence) || isPartialEvidence(value.evidence)) &&
        isConstraintList(value.conditions, 1)
      );
    case "unsupported":
      return isFailedEvidence(value.evidence);
    default:
      return false;
  }
};

/** Throw a `TypeError` if `profile` is not a fully valid, portable profile. */
export const validateModelProfileValue = (profile: ModelProfile): void => {
  const value: unknown = profile;
  if (!isRecord(value)) {
    throw new TypeError("ModelProfile must be an object.");
  }
  if (
    !isImplementationId(value.profileId) ||
    !isImplementationId(value.model) ||
    !isImplementationId(value.provider) ||
    !isImplementationId(value.deployment)
  ) {
    throw new TypeError("ModelProfile references must be 1–255 printable-ASCII identifiers.");
  }
  if (!isContractVersion(value.version)) {
    throw new TypeError("ModelProfile.version must be a SemVer contract version.");
  }
  if (!Array.isArray(value.claims) || !value.claims.every(isValidClaim)) {
    throw new TypeError("ModelProfile.claims must be an array of valid capability claims.");
  }
  if (value.schema !== undefined && !isSchemaRef(value.schema)) {
    throw new TypeError("ModelProfile.schema must be a valid SchemaRef.");
  }
  if (value.extensions !== undefined && !isNativeExtensions(value.extensions)) {
    throw new TypeError(
      "ModelProfile.extensions must be strict JSON keyed by reverse-DNS namespaces.",
    );
  }
};
