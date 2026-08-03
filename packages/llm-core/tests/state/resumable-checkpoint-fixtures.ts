import {
  contractVersion,
  digest,
  externalId,
  newCoreId,
  schemaRef,
  secretRef,
  type DurableJobId,
  type EvidenceId,
  type PrincipalId,
  type ProviderSessionId,
  type ResourceId,
  type RunId,
  type StepId,
} from "#contracts";
import { actionDigest } from "../../src/features/tooling/runtime";
import {
  checkpointId,
  createInterventionRequest,
  interventionDecisionId,
  interventionId,
  type InterventionDecision,
  type InterventionRequest,
  type ResumableCheckpoint,
  type ResumeCompatibility,
} from "../../src/features/state/public";

export const CHECKPOINT_ID = checkpointId("018f0f4e-8c5b-7a91-8c3b-123456789a01");
export const RUN_ID = newCoreId<RunId>("018f0f4e-8c5b-7a91-8c3b-123456789a02");
export const STEP_ONE = newCoreId<StepId>("018f0f4e-8c5b-7a91-8c3b-123456789a03");
export const STEP_TWO = newCoreId<StepId>("018f0f4e-8c5b-7a91-8c3b-123456789a04");
export const INTERVENTION_ID = interventionId("018f0f4e-8c5b-7a91-8c3b-123456789a05");
export const DECISION_ID = interventionDecisionId("018f0f4e-8c5b-7a91-8c3b-123456789a06");
export const NOW = "2026-07-29T12:00:00.000Z";
export const LATER = "2026-07-29T12:01:00.000Z";
export const EXPIRES = "2026-07-29T13:00:00.000Z";

export const ACTION_DIGEST = actionDigest(
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  secretRef("state:test-key"),
);

export const COMPATIBILITY: ResumeCompatibility = {
  runtime: {
    runtimeId: "llm-core.local",
    runtimeVersion: contractVersion("2.0.0"),
  },
  contractSchema: schemaRef({
    schemaId: "https://llm-core.geekist.co/schemas/workflow",
    version: "2.0.0",
    digest: digest("a".repeat(64)),
  }),
  codeDigest: digest("b".repeat(64)),
  checkpointFormat: {
    formatId: "llm-core.checkpoint",
    formatVersion: contractVersion("1.0.0"),
  },
  nativeReferences: [
    {
      namespace: "co.geekist.runtime",
      referenceType: "tool-receipt",
      compatibilityKey: "receipt-v1",
    },
  ],
};

export const receipt = (stepId: StepId, status: "completed" | "started" | "indeterminate") => ({
  stepId,
  actionDigest: ACTION_DIGEST,
  status,
  receipt: {
    evidenceId: newCoreId<EvidenceId>("018f0f4e-8c5b-7a91-8c3b-123456789a07"),
    kind: "execution-receipt" as const,
    content: {
      resourceId: newCoreId<ResourceId>("018f0f4e-8c5b-7a91-8c3b-123456789a08"),
      mediaType: "application/json",
      byteLength: 2,
      digest: digest("c".repeat(64)),
    },
  },
});

export const checkpoint = (overrides: Partial<ResumableCheckpoint> = {}): ResumableCheckpoint => ({
  kind: "resumable-checkpoint",
  checkpointId: CHECKPOINT_ID,
  runId: RUN_ID,
  revision: 3,
  createdAt: NOW,
  compatibility: COMPATIBILITY,
  completedStepIds: [],
  recordedEffects: [],
  state: { count: 0 },
  ...overrides,
});

export const intervention = (
  allowed: InterventionRequest["allowed"] = [
    "approve",
    "deny",
    "defer",
    "edit",
    "cancel",
    "escalate",
  ],
): InterventionRequest =>
  createInterventionRequest({
    intervention: {
      interventionId: INTERVENTION_ID,
      checkpointId: CHECKPOINT_ID,
      checkpointRevision: 3,
      runId: RUN_ID,
      stepId: STEP_ONE,
      actionDigest: ACTION_DIGEST,
    },
    requestedAt: NOW,
    expiresAt: EXPIRES,
    allowed,
  });

export const principal = {
  principalId: externalId<PrincipalId>("operator:jason"),
};

export const decision = (kind: InterventionDecision["decision"]): InterventionDecision => {
  const base = {
    decisionId: DECISION_ID,
    intervention: intervention().intervention,
    decidedAt: LATER,
    actor: principal,
    authentication: {
      scheme: "test-signature",
      evidence: receipt(STEP_ONE, "completed").receipt,
    },
  };
  switch (kind) {
    case "approve":
    case "deny":
    case "cancel":
      return { ...base, decision: kind };
    case "defer":
      return { ...base, decision: kind, resumeAfter: "2026-07-30T12:00:00.000Z" };
    case "edit":
      return { ...base, decision: kind, replacementArguments: { query: "safer" } };
    case "escalate":
      return {
        ...base,
        decision: kind,
        escalateTo: { principalId: externalId<PrincipalId>("operator:senior") },
      };
  }
};

export const providerSessionId = externalId<ProviderSessionId>("provider-session-123");
export const durableJobId = newCoreId<DurableJobId>("018f0f4e-8c5b-7a91-8c3b-123456789a09");
