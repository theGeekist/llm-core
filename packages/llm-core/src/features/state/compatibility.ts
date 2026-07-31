import type { Digest, SchemaRef } from "#contracts";
import type { ResumableCheckpoint, ResumeCompatibility, RuntimeCompatibility } from "./types";
import { sortedNativeReferenceKeys } from "./validation";

export type ResumeCompatibilityFailure =
  | "runtime-id-mismatch"
  | "runtime-version-mismatch"
  | "contract-schema-mismatch"
  | "code-digest-mismatch"
  | "checkpoint-format-id-mismatch"
  | "checkpoint-format-version-mismatch"
  | "native-reference-mismatch";

export type ResumeCompatibilityResult =
  | { compatible: true }
  | { compatible: false; reason: ResumeCompatibilityFailure };

const digestMatches = (left: Digest, right: Digest): boolean =>
  left.algorithm === right.algorithm && left.value === right.value;

const schemaMatches = (left: SchemaRef, right: SchemaRef): boolean =>
  left.schemaId === right.schemaId &&
  left.version === right.version &&
  digestMatches(left.digest, right.digest);

const runtimeMismatch = (
  actual: RuntimeCompatibility,
  expected: RuntimeCompatibility,
): ResumeCompatibilityFailure | null => {
  if (actual.runtimeId !== expected.runtimeId) {
    return "runtime-id-mismatch";
  }
  return actual.runtimeVersion === expected.runtimeVersion ? null : "runtime-version-mismatch";
};

export const checkResumeCompatibility = (
  checkpoint: ResumableCheckpoint,
  expected: ResumeCompatibility,
): ResumeCompatibilityResult => {
  const actual = checkpoint.compatibility;
  const runtimeReason = runtimeMismatch(actual.runtime, expected.runtime);
  if (runtimeReason) {
    return { compatible: false, reason: runtimeReason };
  }
  if (!schemaMatches(actual.contractSchema, expected.contractSchema)) {
    return { compatible: false, reason: "contract-schema-mismatch" };
  }
  if (!digestMatches(actual.codeDigest, expected.codeDigest)) {
    return { compatible: false, reason: "code-digest-mismatch" };
  }
  if (actual.checkpointFormat.formatId !== expected.checkpointFormat.formatId) {
    return { compatible: false, reason: "checkpoint-format-id-mismatch" };
  }
  if (actual.checkpointFormat.formatVersion !== expected.checkpointFormat.formatVersion) {
    return { compatible: false, reason: "checkpoint-format-version-mismatch" };
  }
  if (
    JSON.stringify(sortedNativeReferenceKeys(actual.nativeReferences)) !==
    JSON.stringify(sortedNativeReferenceKeys(expected.nativeReferences))
  ) {
    return { compatible: false, reason: "native-reference-mismatch" };
  }
  return { compatible: true };
};
