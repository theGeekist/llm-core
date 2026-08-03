import type {
  EventSink,
  ToolExecutionEvent,
  ToolExecutionEventKind,
  ToolExecutionReceipt,
  ToolReceiptTransition,
  ToolReceiptState,
} from "../../features/evidence/public";
import { mintedId } from "./execution-invariants";
import type { EventDelivery, ExecuteControlledToolInput } from "./types";

const eventKind = (from: ToolReceiptState, to: ToolReceiptState): ToolExecutionEventKind => {
  if (to === "awaiting_policy") return "tool.policy.requested";
  if (to === "awaiting_approval") return "tool.approval.requested";
  if (from === "awaiting_policy") return "tool.policy.recorded";
  if (from === "awaiting_approval") return "tool.approval.recorded";
  if (to === "started") return "tool.execution.started";
  if (
    to === "succeeded" ||
    to === "failed_after_start" ||
    to === "indeterminate" ||
    to === "cancelled_before_start" ||
    to === "denied" ||
    to === "expired"
  ) {
    return "tool.execution.settled";
  }
  if (to === "reconciliation_required") return "tool.reconciliation.required";
  return "tool.receipt.transitioned";
};

/** Receipt persistence is authoritative; event delivery never gates execution. */
export const project = (sink: EventSink | undefined, event: ToolExecutionEvent): EventDelivery => {
  if (!sink) return "not-configured";
  try {
    void sink.emit(event).catch(() => undefined);
    return "scheduled";
  } catch {
    return "failed";
  }
};

export const mergeDelivery = (current: EventDelivery, next: EventDelivery): EventDelivery => {
  if (current === "failed" || next === "failed") return "failed";
  if (current === "scheduled" || next === "scheduled") return "scheduled";
  return "not-configured";
};

const eventFacts = (receipt: ToolExecutionReceipt, reasonCode?: string) => ({
  receiptId: receipt.receiptId,
  receiptRevision: receipt.revision,
  receiptState: receipt.state,
  effectDisposition: receipt.effectDisposition,
  actionDigest: receipt.actionDigest,
  policy: receipt.policy,
  approval: receipt.approval,
  cancellation: receipt.cancellation,
  approvalExpiresAt: receipt.approvalExpiresAt,
  approvalRequiredApprover: receipt.approvalRequiredApprover,
  reasonCode,
});

export const reservationEvent = (
  input: Pick<ExecuteControlledToolInput, "facts">,
  receipt: ToolExecutionReceipt,
): ToolExecutionEvent => ({
  eventId: mintedId(input.facts.newEventId(), "Tool execution event"),
  kind: "tool.receipt.reserved",
  occurredAt: input.facts.now(),
  sequence: receipt.revision,
  runId: receipt.runId,
  stepId: receipt.stepId,
  toolCallId: receipt.toolCallId,
  facts: eventFacts(receipt),
  redaction: receipt.redaction,
  extensions: receipt.extensions,
});

export const transitionEvent = (
  input: Pick<ExecuteControlledToolInput, "facts">,
  receipt: ToolExecutionReceipt,
  transition: ToolReceiptTransition,
): ToolExecutionEvent => ({
  eventId: mintedId(input.facts.newEventId(), "Tool execution event"),
  kind: eventKind(transition.from, transition.to),
  occurredAt: transition.recordedAt,
  sequence: receipt.revision,
  runId: receipt.runId,
  stepId: receipt.stepId,
  toolCallId: receipt.toolCallId,
  facts: eventFacts(receipt, transition.reasonCode),
  redaction: transition.redaction,
  authorizedEvidence: transition.authorizedEvidence,
  extensions: transition.extensions,
});
