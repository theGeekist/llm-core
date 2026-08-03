import type {
  ToolExecutionReceipt,
  ToolReceiptFence,
  ToolReceiptState,
  ToolReceiptTransition,
} from "../../features/evidence/public";
/* eslint-disable max-params -- transition commands keep durable state fields explicit */
import { cancellationId } from "../../features/control/runtime";
import { toolReceiptFencesEqual } from "../../features/evidence/runtime";
import { mergeDelivery, project, transitionEvent } from "./event-projection";
import { assertReceiptIdentity, DEFAULT_REDACTION, mintedId } from "./execution-invariants";
import type {
  ControlledToolExecutionOutcome,
  EventDelivery,
  ExecuteControlledToolInput,
} from "./types";
import { ToolExecutionCoordinationError } from "./types";

type ReceiptPersistenceInput = Pick<
  ExecuteControlledToolInput,
  "eventSink" | "facts" | "journal" | "redaction"
>;

export type TransitionDetails = Partial<
  Pick<
    ToolReceiptTransition,
    | "approval"
    | "approvalExpiresAt"
    | "approvalRequestedAt"
    | "approvalRequiredApprover"
    | "authorizedEvidence"
    | "cancellation"
    | "policy"
    | "reconciliation"
    | "reasonCode"
  >
>;

export const appendReceipt = async (
  input: ReceiptPersistenceInput,
  receipt: ToolExecutionReceipt,
  to: ToolReceiptState,
  effectDisposition: ToolReceiptTransition["effectDisposition"],
  details: TransitionDetails = {},
): Promise<{ receipt: ToolExecutionReceipt; delivery: EventDelivery }> => {
  const transition: ToolReceiptTransition = {
    transitionId: mintedId(input.facts.newEventId(), "Tool receipt transition"),
    from: receipt.state,
    to,
    recordedAt: input.facts.now(),
    effectDisposition,
    ...details,
    ...(receipt.executionFence === undefined ? {} : { fence: receipt.executionFence }),
    redaction: input.redaction ?? DEFAULT_REDACTION,
  };
  const result = await input.journal.append({
    receiptId: receipt.receiptId,
    expectedRevision: receipt.revision,
    transition,
  });
  if (result.kind !== "appended") {
    throw new ToolExecutionCoordinationError(
      `Receipt transition was not durably appended (${result.kind}).`,
    );
  }
  assertReceiptIdentity(result.receipt, {
    receiptId: receipt.receiptId,
    runId: receipt.runId,
    toolCallId: receipt.toolCallId,
    actionDigest: receipt.actionDigest,
  });
  if (
    result.receipt.revision !== receipt.revision + 1 ||
    result.receipt.state !== to ||
    result.entry.transitionId !== transition.transitionId ||
    result.entry.from !== transition.from ||
    result.entry.to !== transition.to
  ) {
    throw new ToolExecutionCoordinationError(
      "Receipt journal acknowledged a mismatched transition.",
    );
  }
  return {
    receipt: result.receipt,
    delivery: project(input.eventSink, transitionEvent(input, result.receipt, transition)),
  };
};

export const fenceIsCurrent = async (
  journal: ExecuteControlledToolInput["journal"],
  receipt: ToolExecutionReceipt,
  fence: ToolReceiptFence,
): Promise<boolean> => {
  const current = await journal.verifyFence({ receiptId: receipt.receiptId, fence });
  return (
    current.kind === "active" &&
    current.receipt.executionFence !== undefined &&
    toolReceiptFencesEqual(current.receipt.executionFence, fence)
  );
};

export const claimExecutionFence = async (
  input: Pick<
    ExecuteControlledToolInput,
    "facts" | "journal" | "receiptLeaseDurationMs" | "receiptOwner" | "redaction"
  >,
  receipt: ToolExecutionReceipt,
): Promise<
  | { kind: "claimed"; receipt: ToolExecutionReceipt; fence: ToolReceiptFence }
  | { kind: "held"; receipt: ToolExecutionReceipt }
  | { kind: "not-eligible"; receipt: ToolExecutionReceipt }
  | { kind: "not-found" }
> => {
  if (!Number.isSafeInteger(input.receiptLeaseDurationMs) || input.receiptLeaseDurationMs <= 0) {
    throw new ToolExecutionCoordinationError(
      "Receipt lease duration must be a positive safe integer.",
    );
  }
  const result = await input.journal.claim({
    receiptId: receipt.receiptId,
    expectedRevision: receipt.revision,
    owner: input.receiptOwner,
    leaseDurationMs: input.receiptLeaseDurationMs,
    transitionId: mintedId(input.facts.newEventId(), "Tool receipt ownership transition"),
    redaction: input.redaction ?? DEFAULT_REDACTION,
  });
  if (result.kind === "claimed") {
    assertReceiptIdentity(result.receipt, {
      receiptId: receipt.receiptId,
      runId: receipt.runId,
      toolCallId: receipt.toolCallId,
      actionDigest: receipt.actionDigest,
    });
    if (
      result.receipt.executionFence === undefined ||
      !toolReceiptFencesEqual(result.receipt.executionFence, result.fence)
    ) {
      throw new ToolExecutionCoordinationError(
        "Receipt journal acknowledged an invalid execution fence.",
      );
    }
    return { kind: "claimed", receipt: result.receipt, fence: result.fence };
  }
  if (result.kind === "held" || result.kind === "not-eligible") {
    return { kind: result.kind, receipt: result.receipt };
  }
  if (result.kind === "not-found") return { kind: "not-found" };
  return { kind: "held", receipt: result.receipt };
};

export const cancellationReference = (
  input: ExecuteControlledToolInput,
  receipt: ToolExecutionReceipt,
) =>
  receipt.cancellation ?? {
    cancellationId: cancellationId(mintedId(input.facts.newCancellationId(), "Tool cancellation")),
    runId: receipt.runId,
    toolCallId: receipt.toolCallId,
    actionDigest: receipt.actionDigest,
  };

export const cancelBeforeStart = async (
  input: ExecuteControlledToolInput,
  receipt: ToolExecutionReceipt,
  delivery: EventDelivery,
): Promise<ControlledToolExecutionOutcome> => {
  const cancelled = await appendReceipt(input, receipt, "cancelled_before_start", "not-started", {
    cancellation: cancellationReference(input, receipt),
    reasonCode: "cancellation-requested-before-start",
  });
  return {
    status: "cancelled",
    receipt: cancelled.receipt,
    eventDelivery: mergeDelivery(delivery, cancelled.delivery),
  };
};
