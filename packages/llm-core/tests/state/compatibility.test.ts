import { describe, expect, test } from "bun:test";
import { contractVersion, digest, schemaRef } from "#contracts";
import {
  checkResumeCompatibility,
  registerResumableCheckpoint,
  type ResumeCompatibility,
  type ResumeCompatibilityFailure,
} from "../../src/features/state/public";
import { COMPATIBILITY, checkpoint } from "./helpers";

const cases: Array<{
  name: string;
  reason: ResumeCompatibilityFailure;
  mutate(expected: ResumeCompatibility): void;
}> = [
  {
    name: "runtime identity",
    reason: "runtime-id-mismatch",
    mutate: (expected) => {
      (expected.runtime as { runtimeId: string }).runtimeId = "other.runtime";
    },
  },
  {
    name: "runtime version",
    reason: "runtime-version-mismatch",
    mutate: (expected) => {
      (expected.runtime as { runtimeVersion: string }).runtimeVersion = contractVersion("3.0.0");
    },
  },
  {
    name: "contract schema",
    reason: "contract-schema-mismatch",
    mutate: (expected) => {
      (expected as { contractSchema: ResumeCompatibility["contractSchema"] }).contractSchema =
        schemaRef({
          schemaId: "https://llm-core.geekist.co/schemas/workflow",
          version: "2.0.0",
          digest: digest("d".repeat(64)),
        });
    },
  },
  {
    name: "code digest",
    reason: "code-digest-mismatch",
    mutate: (expected) => {
      (expected as { codeDigest: ResumeCompatibility["codeDigest"] }).codeDigest = digest(
        "e".repeat(64),
      );
    },
  },
  {
    name: "checkpoint format identity",
    reason: "checkpoint-format-id-mismatch",
    mutate: (expected) => {
      (expected.checkpointFormat as { formatId: string }).formatId = "other.format";
    },
  },
  {
    name: "checkpoint format version",
    reason: "checkpoint-format-version-mismatch",
    mutate: (expected) => {
      (expected.checkpointFormat as { formatVersion: string }).formatVersion =
        contractVersion("2.0.0");
    },
  },
  {
    name: "native references",
    reason: "native-reference-mismatch",
    mutate: (expected) => {
      (
        expected as {
          nativeReferences: ResumeCompatibility["nativeReferences"];
        }
      ).nativeReferences = [];
    },
  },
];

describe("checkpoint compatibility", () => {
  test("accepts an exact compatibility match", () => {
    const registered = registerResumableCheckpoint(checkpoint());
    expect(checkResumeCompatibility(registered, COMPATIBILITY)).toEqual({ compatible: true });
  });

  for (const entry of cases) {
    test(`rejects ${entry.name} before execution`, () => {
      const expected = structuredClone(COMPATIBILITY) as ResumeCompatibility;
      entry.mutate(expected);
      expect(checkResumeCompatibility(registerResumableCheckpoint(checkpoint()), expected)).toEqual(
        { compatible: false, reason: entry.reason },
      );
    });
  }
});
