import {
  contractVersion,
  digest,
  externalId,
  newCoreId,
  secretRef,
  type EvidenceId,
  type PrincipalId,
  type PrincipalRef,
  type ResourceId,
  type RunId,
  type ToolCallId,
} from "#contracts";
import { actionDigest, type ActionDigest } from "../../src/features/tooling/public";
import {
  approvalId,
  cancellationId,
  policyEvaluationId,
  type ApprovalRef,
  type CancellationRef,
  type PolicyEvaluationRef,
} from "../../src/features/control/public";

export const RUN_ID = newCoreId<RunId>("018f0f4e-8c5b-7a91-8c3b-123456789abc");
export const TOOL_CALL_ID = newCoreId<ToolCallId>("018f0f4e-8c5b-7a91-8c3b-123456789abd");

export const principal = (value: string): PrincipalRef => ({
  principalId: externalId<PrincipalId>(value),
});

export const ACTION_DIGEST = actionDigest(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  secretRef("control:hmac-key:v1"),
);

export const OTHER_ACTION_DIGEST = actionDigest(
  "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  secretRef("control:hmac-key:v1"),
);

export const policyRef = (digestValue: ActionDigest = ACTION_DIGEST): PolicyEvaluationRef => ({
  policyEvaluationId: policyEvaluationId("018f0f4e-8c5b-7a91-8c3b-123456789abe"),
  runId: RUN_ID,
  toolCallId: TOOL_CALL_ID,
  actionDigest: digestValue,
});

export const approvalRef = (digestValue: ActionDigest = ACTION_DIGEST): ApprovalRef => ({
  approvalId: approvalId("018f0f4e-8c5b-7a91-8c3b-123456789abf"),
  runId: RUN_ID,
  toolCallId: TOOL_CALL_ID,
  actionDigest: digestValue,
});

export const cancellationRef = (digestValue: ActionDigest = ACTION_DIGEST): CancellationRef => ({
  cancellationId: cancellationId("018f0f4e-8c5b-7a91-8c3b-123456789ac0"),
  runId: RUN_ID,
  toolCallId: TOOL_CALL_ID,
  actionDigest: digestValue,
});

export const authenticationEvidence = {
  evidenceId: newCoreId<EvidenceId>("018f0f4e-8c5b-7a91-8c3b-123456789ac1"),
  kind: "other",
  content: {
    resourceId: newCoreId<ResourceId>("018f0f4e-8c5b-7a91-8c3b-123456789ac2"),
    mediaType: "application/json",
    byteLength: 2,
    digest: digest("a".repeat(64)),
  },
} as const;

export const VERSION = contractVersion("1.0.0");
