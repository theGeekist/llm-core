import type { EvidenceRef, PrincipalRef, RunId, ToolCallId } from "#contracts";
import type { ActionDigest } from "../tooling/public";
import {
  actionDigestsMatch,
  isCanonicalTimestamp,
  isExpired,
  type ApprovalId,
  type ControlMaybePromise,
} from "./shared";

/** @format date-time */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named control-contract type
export type ApprovalTimestamp = string;

export interface ApprovalRef {
  approvalId: ApprovalId;
  runId: RunId;
  toolCallId: ToolCallId;
  actionDigest: ActionDigest;
}

export interface ApprovalRequest {
  approval: ApprovalRef;
  requestedAt: ApprovalTimestamp;
  expiresAt: ApprovalTimestamp;
  requiredApprover?: PrincipalRef;
  reason?: string;
}

export interface ApprovalAuthenticationRef {
  scheme: string;
  evidence: EvidenceRef;
}

export interface ApprovalDecision {
  approval: ApprovalRef;
  decision: "approve" | "deny";
  decidedAt: ApprovalTimestamp;
  actor: PrincipalRef;
  authentication: ApprovalAuthenticationRef;
  reason?: string;
}

export type ApprovalAuthenticationResult =
  | { status: "authenticated"; principal: PrincipalRef }
  | { status: "rejected"; reason?: string };

export interface ApprovalAuthenticationPort {
  verify(decision: ApprovalDecision): ControlMaybePromise<ApprovalAuthenticationResult>;
}

export type ApprovalVerification =
  | { status: "approved"; approval: ApprovalRef; actor: PrincipalRef }
  | {
      status: "rejected";
      reason:
        | "decision-denied"
        | "action-digest-mismatch"
        | "expired"
        | "identity-mismatch"
        | "invalid-timestamp"
        | "outside-approval-window"
        | "unauthenticated";
    };

const reject = (reason: Exclude<ApprovalVerification, { status: "approved" }>["reason"]) =>
  ({ status: "rejected", reason }) as const;

const verifyApprovalRecord = (input: {
  request: ApprovalRequest;
  decision: ApprovalDecision;
  authentication: ApprovalAuthenticationResult;
  now: ApprovalTimestamp;
}): ApprovalVerification => {
  if (
    !isCanonicalTimestamp(input.request.requestedAt) ||
    !isCanonicalTimestamp(input.request.expiresAt) ||
    !isCanonicalTimestamp(input.decision.decidedAt) ||
    !isCanonicalTimestamp(input.now)
  ) {
    return reject("invalid-timestamp");
  }
  const requestedAt = Date.parse(input.request.requestedAt);
  const expiresAt = Date.parse(input.request.expiresAt);
  const decidedAt = Date.parse(input.decision.decidedAt);
  const now = Date.parse(input.now);
  if (requestedAt >= expiresAt || decidedAt < requestedAt || decidedAt > now) {
    return reject("outside-approval-window");
  }
  if (isExpired(input.request.expiresAt, input.now) || decidedAt >= expiresAt) {
    return reject("expired");
  }
  if (
    input.request.approval.approvalId !== input.decision.approval.approvalId ||
    input.request.approval.runId !== input.decision.approval.runId ||
    input.request.approval.toolCallId !== input.decision.approval.toolCallId
  ) {
    return reject("identity-mismatch");
  }
  if (
    !actionDigestsMatch(input.request.approval.actionDigest, input.decision.approval.actionDigest)
  ) {
    return reject("action-digest-mismatch");
  }
  if (input.decision.decision !== "approve") {
    return reject("decision-denied");
  }
  if (input.authentication.status !== "authenticated") {
    return reject("unauthenticated");
  }
  if (
    input.authentication.principal.principalId !== input.decision.actor.principalId ||
    (input.request.requiredApprover &&
      input.request.requiredApprover.principalId !== input.decision.actor.principalId)
  ) {
    return reject("identity-mismatch");
  }
  return {
    status: "approved",
    approval: input.request.approval,
    actor: input.decision.actor,
  };
};

export const verifyApproval = async (input: {
  request: ApprovalRequest;
  decision: ApprovalDecision;
  authenticator: ApprovalAuthenticationPort;
  now: ApprovalTimestamp;
}): Promise<ApprovalVerification> => {
  let authentication: ApprovalAuthenticationResult;
  try {
    authentication = await input.authenticator.verify(input.decision);
  } catch {
    authentication = { status: "rejected", reason: "authentication-error" };
  }
  return verifyApprovalRecord({ ...input, authentication });
};
