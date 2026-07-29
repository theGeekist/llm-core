import { describe, expect, test } from "bun:test";
import { coreId, type EvidenceId, type ResourceId } from "../../src/contracts/identity";
import type { ExtensionNamespace } from "../../src/contracts/extensions";
import { contractVersion, digest } from "../../src/contracts/versioning";
import type {
  CapabilityBinding,
  CapabilityClaim,
  CapabilityRequirement,
} from "../../src/contracts/capabilities";

const streamingClaim: CapabilityClaim = {
  capabilityId: "llm-core.model.streaming",
  version: contractVersion("1.0.0"),
  status: "supported",
  evidence: {
    report: {
      evidenceId: coreId<EvidenceId>("018f0f4e-8c5b-7a91-8c3b-123456789abc"),
      kind: "evaluation",
      content: {
        resourceId: coreId<ResourceId>("018f0f4e-8c5b-7a91-8c3b-123456789abd"),
        mediaType: "application/json",
        byteLength: 42,
        digest: digest("a".repeat(64)),
      },
    },
    suiteId: "llm-core.model-content",
    suiteVersion: contractVersion("1.2.0"),
    observedAt: "2026-07-29T10:30:00.000Z",
    implementationId: "builtin:model",
    implementationVersion: "1.0.0",
    result: "pass",
  },
};

describe("capability contracts", () => {
  test("requires primary conformance evidence for every claim", () => {
    expect(streamingClaim.evidence.result).toBe("pass");
    expect(streamingClaim.evidence.suiteVersion.toString()).toBe("1.2.0");
    expect(JSON.parse(JSON.stringify(streamingClaim))).toEqual(streamingClaim);
  });

  test("represents explicit requirements without selecting an implementation", () => {
    const requirement: CapabilityRequirement = {
      capabilityId: "llm-core.model.streaming",
      versionRange: "^1.0.0",
      required: true,
      constraints: [{ name: "orderedDeltas", value: true }],
    };

    expect(requirement).toEqual({
      capabilityId: "llm-core.model.streaming",
      versionRange: "^1.0.0",
      required: true,
      constraints: [{ name: "orderedDeltas", value: true }],
    });
  });

  test("keeps binding identity separate from provider terminology", () => {
    const binding: CapabilityBinding = {
      bindingId: "builtin:model",
      claims: [streamingClaim],
      extensions: {
        ["com.example.binding" as ExtensionNamespace]: {
          priority: 10,
        },
      },
    };

    expect(JSON.parse(JSON.stringify(binding))).toEqual(binding);
    expect(binding.claims[0]?.evidence.report.evidenceId.toString()).toBe(
      "018f0f4e-8c5b-7a91-8c3b-123456789abc",
    );
  });

  test("makes contradictory supported/failed claims unrepresentable", () => {
    const failedEvidence = {
      ...streamingClaim.evidence,
      result: "fail" as const,
      failures: [{ name: "streaming", value: false }],
    };

    // @ts-expect-error supported claims require passing primary evidence
    const contradictory: CapabilityClaim = {
      ...streamingClaim,
      evidence: failedEvidence,
    };

    expect(contradictory.evidence.result).toBe("fail");
  });
});
