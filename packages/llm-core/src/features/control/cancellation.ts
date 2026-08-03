import type { PrincipalRef, RunId, ToolCallId } from "#contracts";
import type { ActionDigest } from "../tooling/runtime";
import { actionDigestsMatch, type CancellationId } from "./control-values";

/** @format date-time */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named control-contract type
export type CancellationTimestamp = string;

export interface CancellationRef {
  cancellationId: CancellationId;
  runId: RunId;
  toolCallId: ToolCallId;
  actionDigest: ActionDigest;
}

export interface CancellationRequest {
  cancellation: CancellationRef;
  phase: "before-start" | "after-start";
  requestedAt: CancellationTimestamp;
  requestedBy: PrincipalRef;
  reason?: string;
}

export type CancellationAcknowledgement =
  | {
      cancellation: CancellationRef;
      status: "cancelled-before-start";
      acknowledgedAt: CancellationTimestamp;
    }
  | {
      cancellation: CancellationRef;
      status: "pending-after-start";
      acknowledgedAt: CancellationTimestamp;
    }
  | {
      cancellation: CancellationRef;
      status: "acknowledged-after-start";
      acknowledgedAt: CancellationTimestamp;
      effectDisposition: "none" | "applied" | "partial";
    }
  | {
      cancellation: CancellationRef;
      status: "rejected";
      acknowledgedAt: CancellationTimestamp;
      reason?: string;
    };

export type CancellationResolution =
  | { status: "cancelled-before-start"; cancellation: CancellationRef }
  | {
      status: "cancelled-after-start";
      cancellation: CancellationRef;
      effectDisposition: "none" | "applied" | "partial";
    }
  | { status: "pending"; cancellation: CancellationRef }
  | {
      status: "rejected";
      reason: "identity-mismatch" | "action-digest-mismatch" | "phase-mismatch" | "rejected";
    };

export const resolveCancellation = (
  request: CancellationRequest,
  acknowledgement: CancellationAcknowledgement,
): CancellationResolution => {
  if (
    request.cancellation.cancellationId !== acknowledgement.cancellation.cancellationId ||
    request.cancellation.runId !== acknowledgement.cancellation.runId ||
    request.cancellation.toolCallId !== acknowledgement.cancellation.toolCallId
  ) {
    return { status: "rejected", reason: "identity-mismatch" };
  }
  if (
    !actionDigestsMatch(
      request.cancellation.actionDigest,
      acknowledgement.cancellation.actionDigest,
    )
  ) {
    return { status: "rejected", reason: "action-digest-mismatch" };
  }
  if (acknowledgement.status === "rejected") {
    return { status: "rejected", reason: "rejected" };
  }
  if (
    (request.phase === "before-start" && acknowledgement.status !== "cancelled-before-start") ||
    (request.phase === "after-start" && acknowledgement.status === "cancelled-before-start")
  ) {
    return { status: "rejected", reason: "phase-mismatch" };
  }
  if (acknowledgement.status === "cancelled-before-start") {
    return {
      status: "cancelled-before-start",
      cancellation: request.cancellation,
    };
  }
  if (acknowledgement.status === "acknowledged-after-start") {
    return {
      status: "cancelled-after-start",
      cancellation: request.cancellation,
      effectDisposition: acknowledgement.effectDisposition,
    };
  }
  return { status: "pending", cancellation: request.cancellation };
};
