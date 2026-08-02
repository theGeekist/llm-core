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
import type { ApprovalRef, CancellationRef } from "../control/public";
import type { PolicyEvaluationRef } from "../control/runtime";
import type { EffectClass, ToolId, ToolVersion } from "../tooling/public";
import type { ActionDigest } from "../tooling/runtime";
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

/**
 * Durable identity of the worker currently permitted to advance an effect
 * receipt. Hosts mint this for one process/worker incarnation; it is not a
 * principal, credential, or authorization decision.
 */
export interface ToolReceiptOwner {
  ownerId: string;
}

/**
 * Journal-assigned fencing token for one temporary receipt owner.
 *
 * A higher token supersedes every earlier owner. A token also expires: an old
 * process must not append a result merely because no replacement has claimed
 * the receipt yet.
 */
export interface ToolReceiptFence {
  owner: ToolReceiptOwner;
  token: number;
  acquiredAt: string;
  expiresAt: string;
}

/** Authoritative external observation requested during ambiguous-effect recovery. */
export interface ToolReceiptReconciliationRequest {
  reconciliationId: EventId;
  receiptId: EvidenceId;
  actionDigest: ActionDigest;
  key: ToolReceiptReservationKey;
  effectClass: EffectClass;
  requestedAt: string;
  fence: ToolReceiptFence;
}

/**
 * A reconciler may resolve an external effect only with attributable evidence.
 * It may instead report uncertainty; callers must not infer a result from a
 * timeout, cancellation request, or missing provider response.
 */
export type ToolReceiptReconciliationResult =
  | {
      kind: "known";
      disposition: "applied" | "partial" | "none";
      observedAt: string;
      evidence: EvidenceRef;
    }
  | {
      kind: "unresolved";
      observedAt: string;
      reasonCode: string;
      evidence?: EvidenceRef;
    };

export interface ToolReceiptReconciliationRecord {
  request: ToolReceiptReconciliationRequest;
  result?: ToolReceiptReconciliationResult;
}

/** Adapter/runtime boundary for observing a known external outcome. */
export interface ToolReceiptReconciler {
  reconcile(request: ToolReceiptReconciliationRequest): Promise<ToolReceiptReconciliationResult>;
}

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
  /** Required whenever the receipt has an active execution fence. */
  fence?: ToolReceiptFence;
  reconciliation?: ToolReceiptReconciliationRecord;
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
  /** Current durable execution ownership. Earlier fences are invalid. */
  executionFence?: ToolReceiptFence;
  /** Latest durable reconciliation request/result, if recovery was attempted. */
  reconciliation?: ToolReceiptReconciliationRecord;
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
    }
  | {
      kind: "fence-conflict";
      receipt: ToolExecutionReceipt;
      expectedFence?: ToolReceiptFence;
      actualFence?: ToolReceiptFence;
    };

export interface LoadToolReceipt {
  receiptId: EvidenceId;
}

export interface LookupToolReceiptByIdempotency {
  key: ToolReceiptReservationKey;
}

/**
 * Atomically acquire a durable owner fence. The journal must append ownership
 * history and assign a strictly increasing token. A different owner may take
 * an expired fence only; the journal, not a caller clock comparison, decides
 * staleness.
 */
export interface ClaimToolReceiptExecution {
  receiptId: EvidenceId;
  expectedRevision: number;
  owner: ToolReceiptOwner;
  /** Positive duration evaluated against the journal/storage clock. */
  leaseDurationMs: number;
  transitionId: EventId;
  redaction: RedactionMetadata;
}

/** Storage-authoritative validation immediately before an external invocation. */
export interface VerifyToolReceiptFence {
  receiptId: EvidenceId;
  fence: ToolReceiptFence;
}

export type VerifyToolReceiptFenceResult =
  | { kind: "active"; receipt: ToolExecutionReceipt }
  | { kind: "inactive"; receipt: ToolExecutionReceipt | null };

export type ClaimToolReceiptExecutionResult =
  | {
      kind: "claimed";
      receipt: ToolExecutionReceipt;
      fence: ToolReceiptFence;
      entry: ToolReceiptHistoryEntry;
      durable: "acknowledged";
    }
  | {
      kind: "held";
      receipt: ToolExecutionReceipt;
      fence: ToolReceiptFence;
    }
  | {
      kind: "not-eligible";
      receipt: ToolExecutionReceipt;
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

/**
 * Authoritative storage-neutral write-ahead receipt port.
 *
 * `EventSink` delivery is intentionally absent from this interface. A sink
 * cannot reserve an idempotency key or acknowledge a durable transition.
 */
export interface ToolReceiptJournal {
  reserve(request: ReserveToolReceipt): Promise<ReserveToolReceiptResult>;
  append(request: AppendToolReceiptTransition): Promise<AppendToolReceiptTransitionResult>;
  claim(request: ClaimToolReceiptExecution): Promise<ClaimToolReceiptExecutionResult>;
  verifyFence(request: VerifyToolReceiptFence): Promise<VerifyToolReceiptFenceResult>;
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

export const toolReceiptFencesEqual = (left: ToolReceiptFence, right: ToolReceiptFence): boolean =>
  left.token === right.token &&
  left.owner.ownerId === right.owner.ownerId &&
  left.acquiredAt === right.acquiredAt &&
  left.expiresAt === right.expiresAt;

export const isToolReceiptFenceActive = (fence: ToolReceiptFence, observedAt: string): boolean => {
  const observed = Date.parse(observedAt);
  const expires = Date.parse(fence.expiresAt);
  return Number.isFinite(observed) && Number.isFinite(expires) && observed < expires;
};

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
  ready: ["ready", "started", "denied", "expired", "cancelled_before_start"],
  started: ["started", "succeeded", "failed_after_start", "indeterminate"],
  denied: [],
  expired: [],
  cancelled_before_start: [],
  succeeded: ["compensation_required"],
  failed_after_start: ["compensation_required"],
  indeterminate: ["indeterminate", "succeeded", "failed_after_start", "reconciliation_required"],
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
