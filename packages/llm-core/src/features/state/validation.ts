import {
  isCanonicalUuid,
  isContractVersion,
  isDigest,
  isExternalId,
  isJsonValue,
  isSchemaRef,
} from "#contracts";
import type {
  NativeReferenceCompatibility,
  RecordedEffect,
  ResumableCheckpoint,
  ResumeCompatibility,
} from "./types";

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const NAMESPACE =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean => {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
};

export const isCanonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  DATE_TIME.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(Date.parse(value)).toISOString() === value;

const isSafeId = (value: unknown): value is string =>
  typeof value === "string" && isExternalId(value);

const isNativeReference = (value: unknown): value is NativeReferenceCompatibility =>
  isRecord(value) &&
  hasOnlyKeys(value, ["namespace", "referenceType", "compatibilityKey"]) &&
  typeof value.namespace === "string" &&
  NAMESPACE.test(value.namespace) &&
  isSafeId(value.referenceType) &&
  isSafeId(value.compatibilityKey);

const nativeReferenceKey = (reference: NativeReferenceCompatibility): string =>
  `${reference.namespace}\u0000${reference.referenceType}\u0000${reference.compatibilityKey}`;

const isNativeReferenceList = (
  value: unknown,
): value is readonly NativeReferenceCompatibility[] => {
  if (!Array.isArray(value) || !value.every(isNativeReference)) {
    return false;
  }
  const keys = value.map(nativeReferenceKey);
  return new Set(keys).size === keys.length;
};

const isRuntimeCompatibility = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, ["runtimeId", "runtimeVersion"]) &&
  isSafeId(value.runtimeId) &&
  isContractVersion(value.runtimeVersion);

const isCheckpointFormat = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, ["formatId", "formatVersion"]) &&
  isSafeId(value.formatId) &&
  isContractVersion(value.formatVersion);

export const isResumeCompatibility = (value: unknown): value is ResumeCompatibility =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    "runtime",
    "contractSchema",
    "codeDigest",
    "checkpointFormat",
    "nativeReferences",
  ]) &&
  isRuntimeCompatibility(value.runtime) &&
  isSchemaRef(value.contractSchema) &&
  isDigest(value.codeDigest) &&
  isCheckpointFormat(value.checkpointFormat) &&
  isNativeReferenceList(value.nativeReferences);

const EVIDENCE_KINDS = new Set([
  "artifact",
  "checkpoint",
  "evaluation",
  "event-payload",
  "execution-receipt",
  "other",
  "tool-arguments",
  "tool-result",
]);

const isResourceRef = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, ["resourceId", "mediaType", "byteLength", "digest"]) &&
  isCanonicalUuid(value.resourceId) &&
  typeof value.mediaType === "string" &&
  value.mediaType.includes("/") &&
  typeof value.byteLength === "number" &&
  Number.isSafeInteger(value.byteLength) &&
  value.byteLength >= 0 &&
  isDigest(value.digest);

export const isEvidenceRef = (value: unknown): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, ["evidenceId", "kind", "content", "schema"]) &&
  isCanonicalUuid(value.evidenceId) &&
  typeof value.kind === "string" &&
  EVIDENCE_KINDS.has(value.kind) &&
  isResourceRef(value.content) &&
  (value.schema === undefined || isSchemaRef(value.schema));

export const isRecordedEffect = (value: unknown): value is RecordedEffect =>
  isRecord(value) &&
  hasOnlyKeys(value, ["stepId", "actionDigest", "status", "receipt"]) &&
  isCanonicalUuid(value.stepId) &&
  isRecord(value.actionDigest) &&
  hasOnlyKeys(value.actionDigest, ["algorithm", "keyRef", "value"]) &&
  value.actionDigest.algorithm === "hmac-sha-256" &&
  isRecord(value.actionDigest.keyRef) &&
  hasOnlyKeys(value.actionDigest.keyRef, ["secretId"]) &&
  isExternalId(value.actionDigest.keyRef.secretId) &&
  typeof value.actionDigest.value === "string" &&
  /^[A-Za-z0-9_-]{43}$/.test(value.actionDigest.value) &&
  (value.status === "completed" ||
    value.status === "started" ||
    value.status === "indeterminate") &&
  isEvidenceRef(value.receipt);

const isUniqueStrings = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.every((item) => typeof item === "string") &&
  new Set(value).size === value.length;

export const validateCheckpoint: (value: unknown) => asserts value is ResumableCheckpoint = (
  value,
) => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "kind",
      "checkpointId",
      "runId",
      "revision",
      "createdAt",
      "compatibility",
      "completedStepIds",
      "recordedEffects",
      "state",
    ]) ||
    value.kind !== "resumable-checkpoint" ||
    !isCanonicalUuid(value.checkpointId) ||
    !isCanonicalUuid(value.runId) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !isCanonicalTimestamp(value.createdAt) ||
    !isResumeCompatibility(value.compatibility) ||
    !isUniqueStrings(value.completedStepIds) ||
    !value.completedStepIds.every(isCanonicalUuid) ||
    !Array.isArray(value.recordedEffects) ||
    !value.recordedEffects.every(isRecordedEffect) ||
    !isJsonValue(value.state)
  ) {
    throw new TypeError("ResumableCheckpoint must be a valid, closed portable checkpoint.");
  }

  const effectSteps = value.recordedEffects.map((effect) => effect.stepId);
  if (new Set(effectSteps).size !== effectSteps.length) {
    throw new TypeError("A checkpoint may record at most one effect state per workflow step.");
  }
  const completed = new Set(value.completedStepIds);
  if (
    value.recordedEffects.some(
      (effect) => effect.status === "completed" && !completed.has(effect.stepId),
    )
  ) {
    throw new TypeError("Completed effects must belong to completed workflow steps.");
  }
};

export const clonePortable = <T>(value: T): T => {
  if (!isJsonValue(value)) {
    throw new TypeError("Portable state must contain only finite, acyclic JSON values.");
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

export const sortedNativeReferenceKeys = (
  references: readonly NativeReferenceCompatibility[],
): readonly string[] => references.map(nativeReferenceKey).sort();
