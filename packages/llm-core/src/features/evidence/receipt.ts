import type {
  EvidenceId,
  EvidenceRef,
  EventId,
  PrincipalRef,
  RunId,
  StepId,
  TenantId,
  ToolCallId,
} from "#contracts";
import type { ApprovalRef, CancellationRef, PolicyEvaluationRef } from "../control/public";
import type { ActionDigest, EffectClass, ToolId, ToolVersion } from "../tooling/public";
import type { RedactedNativeExtensions, RedactionMetadata } from "./redaction";

/**
 * Storage uniqueness for one idempotent tool execution.
 *
 * A journal atomically reserves this complete tuple.
 */
export interface ToolReceiptReservationKey {
  securityDomain: string;
  tenantId?: TenantId;
  toolId: ToolId;
  toolVersion: ToolVersion;
  idempotencyKey: string;
}

export type ToolReceiptState =
  | "reserved"
  | "awaiting_policy"
  | "awaiting_approval"
  | "ready"
  | "started"
  | "denied"
  | "expired"
  | "cancelled_before_start"
  | "succeeded"
  | "failed_after_start"
  | "indeterminate"
  | "reconciliation_required"
  | "compensation_required"
  | "compensating"
  | "compensated"
  | "compensation_failed";

export type EffectDisposition =
  | "not-started"
  | "none"
  | "applied"
  | "partial"
  | "unknown"
  | "compensated";

export interface ReserveToolReceipt {
  receiptId: EvidenceId;
  key: ToolReceiptReservationKey;
  actionDigest: ActionDigest;
  effectClass: EffectClass;
  runId: RunId;
  stepId?: StepId;
  toolCallId: ToolCallId;
  policy?: PolicyEvaluationRef;
  approval?: ApprovalRef;
  cancellation?: CancellationRef;
  approvalRequestedAt?: string;
  approvalExpiresAt?: string;
  approvalRequiredApprover?: PrincipalRef;
  redaction: RedactionMetadata;
  /** Already-redacted portable facts only; never raw provider payloads. */
  extensions?: RedactedNativeExtensions;
}

/**
 * A transition proposal contains only portable facts and safe references.
 *
 * Raw arguments, raw results, provider payloads and exception messages are
 * deliberately absent.
 */
export interface ToolReceiptTransition {
  transitionId: EventId;
  from: ToolReceiptState;
  to: ToolReceiptState;
  recordedAt: string;
  effectDisposition: EffectDisposition;
  policy?: PolicyEvaluationRef;
  approval?: ApprovalRef;
  cancellation?: CancellationRef;
  approvalRequestedAt?: string;
  approvalExpiresAt?: string;
  approvalRequiredApprover?: PrincipalRef;
  authorizedEvidence?: EvidenceRef;
  reasonCode?: string;
  redaction: RedactionMetadata;
  /** Already-redacted portable facts only; never raw provider payloads. */
  extensions?: RedactedNativeExtensions;
}

/** A durably appended transition with the journal-assigned revision. */
export interface ToolReceiptHistoryEntry extends ToolReceiptTransition {
  revision: number;
  durable: "acknowledged";
}

/**
 * Append-derived receipt snapshot.
 *
 * `state`, `effectDisposition`, policy/approval references and `revision` are
 * projections of the reservation plus ordered history. The history remains
 * authoritative when a host also materializes this snapshot.
 */
export interface ToolExecutionReceipt extends ReserveToolReceipt {
  revision: number;
  state: ToolReceiptState;
  effectDisposition: EffectDisposition;
  policy?: PolicyEvaluationRef;
  approval?: ApprovalRef;
  cancellation?: CancellationRef;
  approvalRequestedAt?: string;
  approvalExpiresAt?: string;
  approvalRequiredApprover?: PrincipalRef;
  history: ToolReceiptHistoryEntry[];
}

export type ReserveToolReceiptResult =
  | {
      kind: "created";
      receipt: ToolExecutionReceipt;
      durable: "acknowledged";
    }
  | {
      kind: "existing";
      receipt: ToolExecutionReceipt;
      durable: "acknowledged";
    }
  | {
      kind: "conflict";
      existingReceiptId: EvidenceId;
      existingDigest: ActionDigest;
      requestedDigest: ActionDigest;
    };

export interface AppendToolReceiptTransition {
  receiptId: EvidenceId;
  expectedRevision: number;
  transition: ToolReceiptTransition;
}

export type AppendToolReceiptTransitionResult =
  | {
      kind: "appended";
      receipt: ToolExecutionReceipt;
      entry: ToolReceiptHistoryEntry;
      durable: "acknowledged";
    }
  | {
      kind: "revision-conflict";
      receipt: ToolExecutionReceipt;
      expectedRevision: number;
      actualRevision: number;
    }
  | {
      kind: "not-found";
      receiptId: EvidenceId;
    };

export interface LoadToolReceipt {
  receiptId: EvidenceId;
}

export interface LookupToolReceiptByIdempotency {
  key: ToolReceiptReservationKey;
}

/**
 * Authoritative storage-neutral write-ahead receipt port.
 *
 * `EventSink` delivery is intentionally absent from this interface. A sink
 * cannot reserve an idempotency key or acknowledge a durable transition.
 */
export interface ToolReceiptJournal {
  reserve(request: ReserveToolReceipt): Promise<ReserveToolReceiptResult>;
  append(request: AppendToolReceiptTransition): Promise<AppendToolReceiptTransitionResult>;
  load(request: LoadToolReceipt): Promise<ToolExecutionReceipt | null>;
  loadByIdempotency(request: LookupToolReceiptByIdempotency): Promise<ToolExecutionReceipt | null>;
}

export const actionDigestsEqual = (left: ActionDigest, right: ActionDigest): boolean =>
  left.algorithm === right.algorithm &&
  left.keyRef.secretId === right.keyRef.secretId &&
  left.value === right.value;

export const reservationKeysEqual = (
  left: ToolReceiptReservationKey,
  right: ToolReceiptReservationKey,
): boolean =>
  left.securityDomain === right.securityDomain &&
  left.tenantId === right.tenantId &&
  left.toolId === right.toolId &&
  left.toolVersion === right.toolVersion &&
  left.idempotencyKey === right.idempotencyKey;

export const classifyExistingReservation = (
  receipt: ToolExecutionReceipt,
  request: ReserveToolReceipt,
): "existing" | "conflict" =>
  reservationKeysEqual(receipt.key, request.key) &&
  actionDigestsEqual(receipt.actionDigest, request.actionDigest)
    ? "existing"
    : "conflict";

const allowedTransitions: Record<ToolReceiptState, ToolReceiptState[]> = {
  reserved: ["awaiting_policy", "denied", "expired", "cancelled_before_start"],
  awaiting_policy: ["awaiting_approval", "ready", "denied", "expired", "cancelled_before_start"],
  awaiting_approval: ["awaiting_approval", "ready", "denied", "expired", "cancelled_before_start"],
  ready: ["started", "denied", "expired", "cancelled_before_start"],
  started: ["started", "succeeded", "failed_after_start", "indeterminate"],
  denied: [],
  expired: [],
  cancelled_before_start: [],
  succeeded: ["compensation_required"],
  failed_after_start: ["compensation_required"],
  indeterminate: ["succeeded", "failed_after_start", "reconciliation_required"],
  reconciliation_required: [],
  compensation_required: ["compensating"],
  compensating: ["compensated", "compensation_failed"],
  compensated: [],
  compensation_failed: [],
};

export const isToolReceiptTransitionAllowed = (
  from: ToolReceiptState,
  to: ToolReceiptState,
): boolean => allowedTransitions[from].includes(to);
