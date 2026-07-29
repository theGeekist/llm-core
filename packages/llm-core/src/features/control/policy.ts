import type {
  ContractVersion,
  JsonValue,
  PrincipalRef,
  RunId,
  TenantRef,
  ToolCallId,
} from "#contracts";
import { isContractVersion } from "#contracts";
import type { ActionDigest } from "../tooling/public";
import {
  actionDigestsMatch,
  isCanonicalTimestamp,
  type ControlMaybePromise,
  type PolicyEvaluationId,
} from "./shared";

/** @format date-time */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named control-contract type
export type PolicyTimestamp = string;

export interface PolicyEvaluationRef {
  policyEvaluationId: PolicyEvaluationId;
  runId: RunId;
  toolCallId: ToolCallId;
  actionDigest: ActionDigest;
}

export interface PolicyFact {
  name: string;
  value: JsonValue;
}

export interface PolicyEvaluationRequest {
  evaluation: PolicyEvaluationRef;
  principal?: PrincipalRef;
  tenant?: TenantRef;
  facts?: PolicyFact[];
}

interface PolicyDecisionBase {
  evaluation: PolicyEvaluationRef;
  policyId: string;
  policyVersion: ContractVersion;
  decidedAt: PolicyTimestamp;
  reason?: string;
}

export type PolicyDecision =
  | (PolicyDecisionBase & { decision: "allow" })
  | (PolicyDecisionBase & { decision: "deny" })
  | (PolicyDecisionBase & { decision: "require-approval" });

export interface PolicyEvaluationPort {
  evaluate(request: PolicyEvaluationRequest): ControlMaybePromise<PolicyDecision>;
}

export type PolicyAuthorization =
  | { status: "allowed"; evaluation: PolicyEvaluationRef }
  | { status: "approval-required"; evaluation: PolicyEvaluationRef }
  | {
      status: "denied";
      reason:
        | "decision-denied"
        | "identity-mismatch"
        | "action-digest-mismatch"
        | "missing-or-invalid-decision";
      evaluation?: PolicyEvaluationRef;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const POLICY_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;

const readEvaluation = (value: unknown): PolicyEvaluationRef | null => {
  if (!isRecord(value) || !isRecord(value.evaluation)) {
    return null;
  }
  const evaluation = value.evaluation as Partial<PolicyEvaluationRef>;
  if (
    typeof evaluation.policyEvaluationId !== "string" ||
    typeof evaluation.runId !== "string" ||
    typeof evaluation.toolCallId !== "string" ||
    !isRecord(evaluation.actionDigest) ||
    !isRecord(evaluation.actionDigest.keyRef)
  ) {
    return null;
  }
  return evaluation as PolicyEvaluationRef;
};

const isPolicyDecisionRecord = (value: Record<string, unknown>): boolean =>
  POLICY_ID_PATTERN.test(typeof value.policyId === "string" ? value.policyId : "") &&
  isContractVersion(value.policyVersion) &&
  typeof value.decidedAt === "string" &&
  isCanonicalTimestamp(value.decidedAt) &&
  (value.reason === undefined || typeof value.reason === "string") &&
  (value.decision === "allow" ||
    value.decision === "deny" ||
    value.decision === "require-approval");

const matchesEvaluation = (
  expected: PolicyEvaluationRef,
  actual: PolicyEvaluationRef,
): PolicyAuthorization | null => {
  if (
    expected.policyEvaluationId !== actual.policyEvaluationId ||
    expected.runId !== actual.runId ||
    expected.toolCallId !== actual.toolCallId
  ) {
    return { status: "denied", reason: "identity-mismatch", evaluation: actual };
  }
  if (!actionDigestsMatch(expected.actionDigest, actual.actionDigest)) {
    return { status: "denied", reason: "action-digest-mismatch", evaluation: actual };
  }
  return null;
};

export const authorizePolicyDecision = (
  expected: PolicyEvaluationRef,
  value: unknown,
): PolicyAuthorization => {
  if (!isRecord(value)) {
    return { status: "denied", reason: "missing-or-invalid-decision" };
  }
  if (!isPolicyDecisionRecord(value)) {
    return { status: "denied", reason: "missing-or-invalid-decision" };
  }
  const actual = readEvaluation(value);
  if (!actual) {
    return { status: "denied", reason: "missing-or-invalid-decision" };
  }
  const mismatch = matchesEvaluation(expected, actual);
  if (mismatch) {
    return mismatch;
  }
  if (value.decision === "allow") {
    return { status: "allowed", evaluation: actual };
  }
  if (value.decision === "require-approval") {
    return { status: "approval-required", evaluation: actual };
  }
  return {
    status: "denied",
    reason: value.decision === "deny" ? "decision-denied" : "missing-or-invalid-decision",
    evaluation: actual,
  };
};
