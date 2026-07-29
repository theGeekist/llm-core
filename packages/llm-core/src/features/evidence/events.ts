import type {
  EvidenceId,
  EvidenceRef,
  EventId,
  PrincipalRef,
  RunId,
  StepId,
  ToolCallId,
} from "#contracts";
import type { ApprovalRef, CancellationRef, PolicyEvaluationRef } from "../control/public";
import type { ActionDigest } from "../tooling/public";
import type { EffectDisposition, ToolReceiptState } from "./receipt";
import type { RedactedNativeExtensions, RedactionMetadata } from "./redaction";

export type ExecutionEventKind =
  | "tool.receipt.reserved"
  | "tool.receipt.transitioned"
  | "tool.policy.requested"
  | "tool.policy.recorded"
  | "tool.approval.requested"
  | "tool.approval.recorded"
  | "tool.execution.started"
  | "tool.execution.settled"
  | "tool.reconciliation.required"
  | "tool.compensation.updated";

/**
 * Canonical execution facts safe for event projection.
 *
 * The structure carries identities, digests, states and authorized references
 * only. Raw arguments, results, native payloads and error messages have no
 * representable field.
 */
export interface ExecutionEventFacts {
  receiptId: EvidenceId;
  receiptRevision: number;
  receiptState: ToolReceiptState;
  effectDisposition: EffectDisposition;
  actionDigest: ActionDigest;
  policy?: PolicyEvaluationRef;
  approval?: ApprovalRef;
  cancellation?: CancellationRef;
  approvalExpiresAt?: string;
  approvalRequiredApprover?: PrincipalRef;
  reasonCode?: string;
}

export interface ExecutionEvent {
  eventId: EventId;
  kind: ExecutionEventKind;
  occurredAt: string;
  sequence: number;
  runId: RunId;
  stepId?: StepId;
  toolCallId: ToolCallId;
  causalParentId?: EventId;
  facts: ExecutionEventFacts;
  redaction: RedactionMetadata;
  authorizedEvidence?: EvidenceRef;
  /** Already-redacted portable facts only; never raw provider payloads. */
  extensions?: RedactedNativeExtensions;
}

/**
 * Best-effort event projection port.
 *
 * A resolved call means only that the sink accepted this projection. It is not
 * a durable receipt acknowledgement and cannot authorize execution or retry.
 */
export interface EventSink {
  emit(event: ExecutionEvent): Promise<void>;
  emitMany?(events: ExecutionEvent[]): Promise<void>;
}
