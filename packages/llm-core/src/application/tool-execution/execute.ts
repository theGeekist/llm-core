/* eslint-disable max-lines, max-params, sonarjs/cognitive-complexity --
 * This is the auditable application state machine. Its branches deliberately
 * mirror durable receipt states and fail-closed recovery paths.
 */
import {
  isCanonicalUuid,
  isSchemaRef,
  isUuidV7,
  type EvidenceRef,
  type JsonValue,
  type RunId,
} from "#contracts";
import {
  approvalId,
  authorizePolicyDecision,
  cancellationId,
  policyEvaluationId,
  verifyApproval,
  type ConcurrencyLease,
  type ConcurrencyRequest,
  type PolicyEvaluationRef,
} from "../../features/control/runtime";
import type {
  ApprovalDecision,
  ApprovalRef,
  CancellationRef,
  PolicyFact,
} from "../../features/control/public";
import {
  type EventSink,
  type ToolExecutionEvent,
  type ToolExecutionEventKind,
  type RedactionMetadata,
  type ToolExecutionReceipt,
  type ToolReceiptFence,
  type ToolReceiptReconciliationRecord,
  type ToolReceiptReconciliationResult,
  type ToolReceiptState,
  type ToolReceiptTransition,
} from "../../features/evidence/public";
import {
  actionDigestsEqual,
  reservationKeysEqual,
  toolReceiptFencesEqual,
} from "../../features/evidence/runtime";
import {
  bindAction,
  isRegisteredExecutableTool,
  rebindValidatedToolCall,
  type BoundAction,
  type EffectClass,
  type ToolExecutionControl,
} from "../../features/tooling/orchestration";
import { verifyCompilationAuthority } from "../specification-compiler/runtime";
import type {
  ControlledToolExecutionOutcome,
  ControlledToolReceiptReconciliationOutcome,
  EventDelivery,
  ExecuteControlledToolInput,
  ReconcileControlledToolReceiptInput,
} from "./types";
import { ToolExecutionCoordinationError } from "./types";

const DEFAULT_REDACTION: RedactionMetadata = {
  kind: "evidence-only",
  categories: ["arguments", "result", "credentials", "native-payload"],
};

const TERMINAL_STATES = new Set<ToolReceiptState>([
  "denied",
  "expired",
  "cancelled_before_start",
  "succeeded",
  "failed_after_start",
  "reconciliation_required",
  "compensation_required",
  "compensating",
  "compensated",
  "compensation_failed",
]);

const meaningfulEffect = (effectClass: EffectClass): boolean => effectClass !== "read-only";

const mintedId = <TId extends string>(value: TId, label: string): TId => {
  if (!isUuidV7(value)) {
    throw new TypeError(`${label} identity ports must mint canonical UUIDv7 IDs.`);
  }
  return value;
};

const requireRunId = (input: ExecuteControlledToolInput): RunId => {
  const runId = input.call.invocation.runId;
  if (!runId) {
    throw new ToolExecutionCoordinationError(
      "Controlled tool execution requires InvocationContext.runId.",
    );
  }
  return runId;
};

const sameDigest = (
  left: {
    readonly algorithm: string;
    readonly keyRef: { readonly secretId: string };
    readonly value: string;
  },
  right: typeof left,
): boolean =>
  left.algorithm === right.algorithm &&
  left.keyRef.secretId === right.keyRef.secretId &&
  left.value === right.value;

const sameToolTarget = (
  left: NonNullable<ExecuteControlledToolInput["specification"]>["compiled"]["value"]["tool"],
  right: ExecuteControlledToolInput["tool"]["definition"],
): boolean =>
  left.id === right.id &&
  left.version === right.version &&
  left.effect.class === right.effect.class &&
  left.effect.targets.length === right.effect.targets.length &&
  left.effect.targets.every(
    (target, index) =>
      target.kind === right.effect.targets[index]?.kind &&
      target.id === right.effect.targets[index]?.id,
  ) &&
  left.execution.concurrency === right.execution.concurrency &&
  left.execution.cancellation === right.execution.cancellation &&
  left.execution.idempotency === right.execution.idempotency &&
  left.execution.retryAfterStart === right.execution.retryAfterStart;

const specificationMatchesAction = (
  input: ExecuteControlledToolInput,
  bound: BoundAction,
): boolean => {
  const plan = input.specification?.compiled.value;
  if (plan === undefined) return true;
  try {
    return (
      sameToolTarget(plan.tool, input.tool.definition) &&
      plan.action.canonicalDocument === bound.canonicalDocument &&
      sameDigest(plan.action.digest, bound.digest)
    );
  } catch {
    return false;
  }
};

const verifySpecification = async (
  input: ExecuteControlledToolInput,
  bound?: BoundAction,
): Promise<void> => {
  if (input.specification === undefined) return;
  await verifyCompilationAuthority({
    compiled: input.specification.compiled,
    authority: input.specification.authority,
  });
  if (bound && !specificationMatchesAction(input, bound)) {
    throw new TypeError("Compiled specification does not authorize this controlled tool action.");
  }
};

const eventKind = (from: ToolReceiptState, to: ToolReceiptState): ToolExecutionEventKind => {
  if (to === "awaiting_policy") {
    return "tool.policy.requested";
  }
  if (to === "awaiting_approval") {
    return "tool.approval.requested";
  }
  if (from === "awaiting_policy") {
    return "tool.policy.recorded";
  }
  if (from === "awaiting_approval") {
    return "tool.approval.recorded";
  }
  if (to === "started") {
    return "tool.execution.started";
  }
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
  if (to === "reconciliation_required") {
    return "tool.reconciliation.required";
  }
  return "tool.receipt.transitioned";
};

/**
 * Event projection is intentionally scheduled without awaiting the sink.
 * Receipt persistence is authoritative and an unavailable sink cannot delay
 * authorization, execution, or recovery.
 */
const project = (sink: EventSink | undefined, event: ToolExecutionEvent): EventDelivery => {
  if (!sink) {
    return "not-configured";
  }
  try {
    void sink.emit(event).catch(() => undefined);
    return "scheduled";
  } catch {
    return "failed";
  }
};

const mergeDelivery = (current: EventDelivery, next: EventDelivery): EventDelivery => {
  if (current === "failed" || next === "failed") {
    return "failed";
  }
  if (current === "scheduled" || next === "scheduled") {
    return "scheduled";
  }
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

type ReceiptEventInput = Pick<ExecuteControlledToolInput, "facts" | "eventSink">;
type ReceiptPersistenceInput = ReceiptEventInput &
  Pick<ExecuteControlledToolInput, "journal" | "redaction">;

const reservationEvent = (
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

const transitionEvent = (
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

const assertReceiptIdentity = (
  receipt: ToolExecutionReceipt,
  expected: {
    receiptId?: ToolExecutionReceipt["receiptId"];
    runId?: ToolExecutionReceipt["runId"];
    toolCallId?: ToolExecutionReceipt["toolCallId"];
    actionDigest: ToolExecutionReceipt["actionDigest"];
  },
): void => {
  if (
    (expected.receiptId && receipt.receiptId !== expected.receiptId) ||
    (expected.runId && receipt.runId !== expected.runId) ||
    (expected.toolCallId && receipt.toolCallId !== expected.toolCallId) ||
    !actionDigestsEqual(receipt.actionDigest, expected.actionDigest)
  ) {
    throw new ToolExecutionCoordinationError(
      "Receipt journal returned mismatched execution facts.",
    );
  }
};

type TransitionDetails = Partial<
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

const append = async (
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

const fenceIsCurrent = async (
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

const claimExecutionFence = async (
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
  if (result.kind === "not-found") {
    return { kind: "not-found" };
  }
  return { kind: "held", receipt: result.receipt };
};

const createExecutionControl = (supplied?: ToolExecutionControl): ToolExecutionControl =>
  supplied ?? {
    isCancellationRequested: () => false,
    onCancellationRequested: () => () => undefined,
  };

const cancellationRef = (
  input: ExecuteControlledToolInput,
  receipt: ToolExecutionReceipt,
): CancellationRef =>
  receipt.cancellation ?? {
    cancellationId: cancellationId(mintedId(input.facts.newCancellationId(), "Tool cancellation")),
    runId: receipt.runId,
    toolCallId: receipt.toolCallId,
    actionDigest: receipt.actionDigest,
  };

const cancelBeforeStart = async (
  input: ExecuteControlledToolInput,
  receipt: ToolExecutionReceipt,
  delivery: EventDelivery,
): Promise<ControlledToolExecutionOutcome> => {
  const cancelled = await append(input, receipt, "cancelled_before_start", "not-started", {
    cancellation: cancellationRef(input, receipt),
    reasonCode: "cancellation-requested-before-start",
  });
  return {
    status: "cancelled",
    receipt: cancelled.receipt,
    eventDelivery: mergeDelivery(delivery, cancelled.delivery),
  };
};

const policyFacts = (bound: BoundAction): PolicyFact[] => [
  { name: "tool.id", value: bound.document.tool.id },
  { name: "tool.version", value: bound.document.tool.version },
  { name: "tool.input-schema-digest", value: bound.document.tool.inputSchemaDigest },
  { name: "effect.class", value: bound.document.effect.class },
  { name: "effect.targets", value: bound.document.effect.targets as unknown as JsonValue },
  { name: "execution.semantics", value: bound.document.execution as unknown as JsonValue },
  { name: "action.arguments", value: bound.document.arguments },
];

const isExpired = (expiresAt: string | undefined, now: string): boolean =>
  expiresAt !== undefined &&
  (!Number.isFinite(Date.parse(expiresAt)) ||
    !Number.isFinite(Date.parse(now)) ||
    Date.parse(now) >= Date.parse(expiresAt));

const leaseMatches = (actual: ConcurrencyLease, expected: ConcurrencyRequest): boolean =>
  actual.request.runId === expected.runId &&
  actual.request.toolCallId === expected.toolCallId &&
  actual.request.mode === expected.mode;

const acquireInterruptibly = async (
  input: ExecuteControlledToolInput,
  request: ConcurrencyRequest,
  control: ToolExecutionControl,
): Promise<ConcurrencyLease | null> => {
  if (control.isCancellationRequested()) {
    return null;
  }
  return new Promise<ConcurrencyLease | null>((resolve, reject) => {
    let settled = false;
    let unsubscribe = (): void => undefined;
    const handleCancellation = (): void => {
      if (!settled) {
        settled = true;
        try {
          unsubscribe();
        } catch {
          // Cancellation still wins even if a host cleanup callback is faulty.
        }
        resolve(null);
      }
    };
    unsubscribe = control.onCancellationRequested(handleCancellation);
    if (control.isCancellationRequested()) {
      handleCancellation();
    }
    void input.concurrency.acquire(request).then(
      async (lease) => {
        if (settled) {
          try {
            await lease.release();
          } catch {
            // A late lease release cannot change the durable cancellation fact.
          }
          return;
        }
        settled = true;
        try {
          unsubscribe();
        } catch {
          // Lease ownership is already established; cleanup is best-effort.
        }
        resolve(lease);
      },
      (error: unknown) => {
        if (!settled) {
          settled = true;
          try {
            unsubscribe();
          } catch {
            // Rejection remains authoritative over callback cleanup.
          }
          reject(error);
        }
      },
    );
  });
};

const existingOutcome = (receipt: ToolExecutionReceipt): ControlledToolExecutionOutcome | null => {
  if (receipt.state === "started" || receipt.state === "indeterminate") {
    return { status: "indeterminate", receipt, eventDelivery: "not-configured" };
  }
  if (TERMINAL_STATES.has(receipt.state)) {
    return { status: "existing", receipt, eventDelivery: "not-configured" };
  }
  return null;
};

const unresolvedReconciliation = (
  observedAt: string,
  reasonCode: string,
): ToolReceiptReconciliationResult => ({
  kind: "unresolved",
  observedAt,
  reasonCode,
});

const MEDIA_TYPE =
  // eslint-disable-next-line sonarjs/regex-complexity -- mirrors the canonical contract media type syntax
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[^"]*"))*$/;
const SHA_256 = /^[0-9a-f]{64}$/;

const snapshotRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> | null => {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors);
    if (
      required.some((key) => !(key in descriptors)) ||
      keys.some((key) => !required.includes(key) && !optional.includes(key))
    ) {
      return null;
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
};

const isCanonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const snapshotEvidenceRef = (value: unknown): EvidenceRef | null => {
  const evidence = snapshotRecord(value, ["evidenceId", "kind", "content"], ["schema"]);
  if (!evidence) return null;
  const content = snapshotRecord(evidence.content, [
    "resourceId",
    "mediaType",
    "byteLength",
    "digest",
  ]);
  const digest = snapshotRecord(content?.digest, ["algorithm", "value"]);
  if (
    !content ||
    !digest ||
    !isCanonicalUuid(evidence.evidenceId) ||
    typeof evidence.kind !== "string" ||
    ![
      "artifact",
      "checkpoint",
      "evaluation",
      "event-payload",
      "execution-receipt",
      "other",
      "tool-arguments",
      "tool-result",
    ].includes(evidence.kind) ||
    !isCanonicalUuid(content.resourceId) ||
    typeof content.mediaType !== "string" ||
    !MEDIA_TYPE.test(content.mediaType) ||
    !Number.isSafeInteger(content.byteLength) ||
    (content.byteLength as number) < 0 ||
    digest.algorithm !== "sha-256" ||
    typeof digest.value !== "string" ||
    !SHA_256.test(digest.value)
  ) {
    return null;
  }
  const hasSchema = Object.hasOwn(evidence, "schema");
  const schemaValue = evidence.schema;
  let schema: EvidenceRef["schema"];
  if (hasSchema) {
    const schemaRecord = snapshotRecord(schemaValue, ["schemaId", "version", "digest"]);
    const schemaDigest = snapshotRecord(schemaRecord?.digest, ["algorithm", "value"]);
    if (!schemaRecord || !schemaDigest) return null;
    const candidate = {
      schemaId: schemaRecord.schemaId,
      version: schemaRecord.version,
      digest: {
        algorithm: schemaDigest.algorithm,
        value: schemaDigest.value,
      },
    };
    if (
      typeof candidate.schemaId !== "string" ||
      typeof candidate.version !== "string" ||
      candidate.digest.algorithm !== "sha-256" ||
      typeof candidate.digest.value !== "string" ||
      !SHA_256.test(candidate.digest.value) ||
      !isSchemaRef(candidate)
    ) {
      return null;
    }
    schema = Object.freeze({ ...candidate, digest: Object.freeze({ ...candidate.digest }) });
  }
  return Object.freeze({
    evidenceId: evidence.evidenceId,
    kind: evidence.kind,
    content: Object.freeze({ ...content, digest: Object.freeze({ ...digest }) }),
    ...(schema === undefined ? {} : { schema }),
  }) as EvidenceRef;
};

const SAFE_RECONCILIATION_REASONS = new Set(["provider-outcome-unknown"]);

const isSafeReconciliationReason = (value: unknown): value is string =>
  typeof value === "string" && SAFE_RECONCILIATION_REASONS.has(value);

const validateReconciliationResult = (
  value: unknown,
  fallbackObservedAt: string,
): ToolReceiptReconciliationResult => {
  const header = snapshotRecord(
    value,
    ["kind", "observedAt"],
    ["disposition", "evidence", "reasonCode"],
  );
  if (!header || typeof header.kind !== "string") {
    return unresolvedReconciliation(fallbackObservedAt, "reconciliation-result-invalid");
  }
  if (header.kind === "known") {
    const record = snapshotRecord(value, ["kind", "disposition", "observedAt", "evidence"]);
    if (
      !record ||
      typeof record.disposition !== "string" ||
      !["applied", "partial", "none"].includes(record.disposition) ||
      !isCanonicalTimestamp(record.observedAt)
    ) {
      return unresolvedReconciliation(fallbackObservedAt, "reconciliation-result-invalid");
    }
    const evidence = snapshotEvidenceRef(record.evidence);
    if (evidence) {
      return Object.freeze({
        kind: "known",
        disposition: record.disposition,
        observedAt: record.observedAt,
        evidence,
      }) as ToolReceiptReconciliationResult;
    }
  }
  if (header.kind === "unresolved") {
    const record = snapshotRecord(value, ["kind", "observedAt", "reasonCode"], ["evidence"]);
    if (
      !record ||
      !isCanonicalTimestamp(record.observedAt) ||
      !isSafeReconciliationReason(record.reasonCode)
    ) {
      return unresolvedReconciliation(fallbackObservedAt, "reconciliation-result-invalid");
    }
    if (!Object.hasOwn(record, "evidence")) {
      return Object.freeze({
        kind: "unresolved",
        observedAt: record.observedAt,
        reasonCode: record.reasonCode,
      });
    }
    const evidence = snapshotEvidenceRef(record.evidence);
    if (evidence) {
      return Object.freeze({
        kind: "unresolved",
        observedAt: record.observedAt,
        reasonCode: record.reasonCode,
        evidence,
      });
    }
  }
  return unresolvedReconciliation(fallbackObservedAt, "reconciliation-result-invalid");
};

/**
 * Reconcile an ambiguous durable effect without ever invoking its tool again.
 * A journal claim is required even for recovery so an expired worker cannot
 * overwrite a newer owner's evidence or outcome.
 */
export const reconcileControlledToolReceipt = async (
  input: ReconcileControlledToolReceiptInput,
): Promise<ControlledToolReceiptReconciliationOutcome> => {
  const loaded = await input.journal.load({ receiptId: input.receiptId });
  if (loaded === null) {
    return { status: "not-found", receiptId: input.receiptId };
  }
  if (loaded.state !== "started" && loaded.state !== "indeterminate") {
    return { status: "not-eligible", receipt: loaded, eventDelivery: "not-configured" };
  }

  const claim = await claimExecutionFence(input, loaded);
  if (claim.kind === "not-found") {
    return { status: "not-found", receiptId: input.receiptId };
  }
  if (claim.kind === "held") {
    return { status: "held", receipt: claim.receipt, eventDelivery: "not-configured" };
  }
  if (claim.kind === "not-eligible") {
    return { status: "not-eligible", receipt: claim.receipt, eventDelivery: "not-configured" };
  }

  let receipt = claim.receipt;
  let delivery: EventDelivery = "not-configured";
  if (receipt.state === "started") {
    const indeterminate = await append(input, receipt, "indeterminate", "unknown", {
      reasonCode: "recovery-owner-observed-started",
    });
    receipt = indeterminate.receipt;
    delivery = mergeDelivery(delivery, indeterminate.delivery);
  }

  const request = {
    reconciliationId: mintedId(input.facts.newEventId(), "Tool receipt reconciliation"),
    receiptId: receipt.receiptId,
    actionDigest: receipt.actionDigest,
    key: receipt.key,
    effectClass: receipt.effectClass,
    requestedAt: input.facts.now(),
    fence: claim.fence,
  };
  const requestedRecord: ToolReceiptReconciliationRecord = { request };
  const requested = await append(input, receipt, "indeterminate", "unknown", {
    reasonCode: "reconciliation-requested",
    reconciliation: requestedRecord,
  });
  receipt = requested.receipt;
  delivery = mergeDelivery(delivery, requested.delivery);

  if (!(await fenceIsCurrent(input.journal, receipt, claim.fence))) {
    return { status: "indeterminate", receipt, eventDelivery: delivery };
  }

  let externalResult: unknown;
  try {
    externalResult = await input.reconciler.reconcile(request);
  } catch {
    externalResult = undefined;
  }
  const result = validateReconciliationResult(externalResult, input.facts.now());
  const reconciliation: ToolReceiptReconciliationRecord = { request, result };
  try {
    const recorded = await append(input, receipt, "indeterminate", "unknown", {
      reasonCode: "reconciliation-result-recorded",
      authorizedEvidence: result.evidence,
      reconciliation,
    });
    receipt = recorded.receipt;
    delivery = mergeDelivery(delivery, recorded.delivery);
  } catch {
    return { status: "indeterminate", receipt, eventDelivery: delivery };
  }
  if (result.kind === "known") {
    const resolution =
      result.disposition === "applied"
        ? { state: "succeeded" as const, disposition: "applied" as const }
        : {
            state: "failed_after_start" as const,
            disposition: result.disposition,
          };
    try {
      const settled = await append(input, receipt, resolution.state, resolution.disposition, {
        reasonCode: `reconciliation-known-${result.disposition}`,
        authorizedEvidence: result.evidence,
        reconciliation,
      });
      return {
        status: "reconciled",
        receipt: settled.receipt,
        eventDelivery: mergeDelivery(delivery, settled.delivery),
      };
    } catch {
      return { status: "indeterminate", receipt, eventDelivery: delivery };
    }
  }
  try {
    const unresolved = await append(input, receipt, "reconciliation_required", "unknown", {
      reasonCode: result.reasonCode,
      authorizedEvidence: result.evidence,
      reconciliation,
    });
    return {
      status: "reconciliation-required",
      receipt: unresolved.receipt,
      eventDelivery: mergeDelivery(delivery, unresolved.delivery),
    };
  } catch {
    return { status: "indeterminate", receipt, eventDelivery: delivery };
  }
};

export const executeControlledTool = async (
  originalInput: ExecuteControlledToolInput,
): Promise<ControlledToolExecutionOutcome> => {
  await verifySpecification(originalInput);
  if (!isRegisteredExecutableTool(originalInput.tool)) {
    throw new TypeError("Controlled tool execution requires a registered ExecutableTool.");
  }
  const validatedCall = await originalInput.tool.validate({ call: originalInput.call });
  let input = { ...originalInput, call: validatedCall };
  const requestedRunId = requireRunId(input);
  const effectClass = input.tool.definition.effect.class;
  const isMeaningful = meaningfulEffect(effectClass);
  if (isMeaningful && !input.call.idempotencyKey) {
    throw new ToolExecutionCoordinationError(
      "Meaningful effects require an explicit idempotency key.",
    );
  }

  const bound = await bindAction({
    definition: input.tool.definition,
    call: input.call,
    securityDomain: input.securityDomain,
    keyRef: input.digestKeyRef,
    digestPort: input.digestPort,
  });
  await verifySpecification(input, bound);
  const reserveRequest = {
    receiptId: mintedId(input.facts.newReceiptId(), "Tool receipt"),
    key: {
      securityDomain: input.securityDomain,
      tenantId: input.call.invocation.tenant?.tenantId,
      toolId: input.call.toolId,
      toolVersion: input.call.toolVersion,
      idempotencyKey: input.call.idempotencyKey ?? `tool-call:${input.call.toolCallId}`,
    },
    actionDigest: bound.digest,
    effectClass,
    runId: requestedRunId,
    stepId: input.call.invocation.stepId,
    toolCallId: input.call.toolCallId,
    redaction: input.redaction ?? DEFAULT_REDACTION,
  };
  const reservation = await input.journal.reserve(reserveRequest);
  if (reservation.kind === "conflict") {
    return { status: "conflict", existingReceiptId: reservation.existingReceiptId };
  }
  assertReceiptIdentity(
    reservation.receipt,
    reservation.kind === "created"
      ? {
          runId: requestedRunId,
          toolCallId: input.call.toolCallId,
          actionDigest: bound.digest,
        }
      : { actionDigest: bound.digest },
  );
  if (
    !reservationKeysEqual(reservation.receipt.key, reserveRequest.key) ||
    (reservation.kind === "created" &&
      (reservation.receipt.receiptId !== reserveRequest.receiptId ||
        reservation.receipt.state !== "reserved" ||
        reservation.receipt.revision !== 0))
  ) {
    throw new ToolExecutionCoordinationError(
      "Receipt journal acknowledged a mismatched reservation.",
    );
  }
  const replayOutcome =
    reservation.kind === "existing" ? existingOutcome(reservation.receipt) : null;
  if (replayOutcome) {
    return replayOutcome;
  }

  if (reservation.kind === "existing") {
    input = {
      ...input,
      call: rebindValidatedToolCall({
        tool: input.tool,
        call: input.call,
        toolCallId: reservation.receipt.toolCallId,
        runId: reservation.receipt.runId,
        ...(reservation.receipt.stepId === undefined ? {} : { stepId: reservation.receipt.stepId }),
      }),
    };
  }
  const runId = reservation.receipt.runId;
  let receipt = reservation.receipt;
  let delivery: EventDelivery =
    reservation.kind === "created"
      ? project(input.eventSink, reservationEvent(input, receipt))
      : "not-configured";
  const control = createExecutionControl(input.executionControl);
  if (control.isCancellationRequested()) {
    return cancelBeforeStart(input, receipt, delivery);
  }

  if (receipt.state === "reserved") {
    if (isMeaningful && !input.policy) {
      const denied = await append(input, receipt, "denied", "not-started", {
        reasonCode: "policy-required-for-meaningful-effect",
      });
      return {
        status: "denied",
        receipt: denied.receipt,
        eventDelivery: mergeDelivery(delivery, denied.delivery),
      };
    }
    const policy: PolicyEvaluationRef | undefined = input.policy
      ? {
          policyEvaluationId: policyEvaluationId(
            mintedId(input.facts.newPolicyEvaluationId(), "Tool policy evaluation"),
          ),
          runId,
          toolCallId: input.call.toolCallId,
          actionDigest: bound.digest,
        }
      : undefined;
    const awaiting = await append(input, receipt, "awaiting_policy", "not-started", {
      policy,
      reasonCode: policy ? "policy-evaluation-requested" : "policy-not-required-read-only",
    });
    receipt = awaiting.receipt;
    delivery = mergeDelivery(delivery, awaiting.delivery);
  }

  if (receipt.state === "awaiting_policy") {
    if (!receipt.policy) {
      const ready = await append(input, receipt, "ready", "not-started", {
        reasonCode: "policy-not-required-read-only",
      });
      receipt = ready.receipt;
      delivery = mergeDelivery(delivery, ready.delivery);
    } else {
      let decision: unknown;
      try {
        decision = await input.policy?.evaluate({
          evaluation: receipt.policy,
          principal: input.call.invocation.principal,
          tenant: input.call.invocation.tenant,
          facts: policyFacts(bound),
        });
      } catch {
        decision = null;
      }
      const authorization = authorizePolicyDecision(receipt.policy, decision);
      if (authorization.status === "denied") {
        const denied = await append(input, receipt, "denied", "not-started", {
          policy: receipt.policy,
          reasonCode: `policy-${authorization.reason}`,
        });
        return {
          status: "denied",
          receipt: denied.receipt,
          eventDelivery: mergeDelivery(delivery, denied.delivery),
        };
      }
      if (authorization.status === "allowed") {
        const ready = await append(input, receipt, "ready", "not-started", {
          policy: receipt.policy,
        });
        receipt = ready.receipt;
        delivery = mergeDelivery(delivery, ready.delivery);
      } else {
        const approval: ApprovalRef = {
          approvalId: approvalId(mintedId(input.facts.newApprovalId(), "Tool approval")),
          runId,
          toolCallId: input.call.toolCallId,
          actionDigest: bound.digest,
        };
        const waiting = await append(input, receipt, "awaiting_approval", "not-started", {
          policy: receipt.policy,
          approval,
        });
        receipt = waiting.receipt;
        delivery = mergeDelivery(delivery, waiting.delivery);
      }
    }
  }

  if (receipt.state === "awaiting_approval") {
    if (!input.approval || !receipt.approval) {
      return { status: "awaiting-approval", receipt, eventDelivery: delivery };
    }
    const currentApproval = receipt.approval;
    const requestedAt = receipt.approvalRequestedAt ?? input.facts.now();
    const expiresAt =
      receipt.approvalExpiresAt ??
      (typeof input.approval.expiresAt === "function"
        ? input.approval.expiresAt(requestedAt)
        : input.approval.expiresAt);
    if (!receipt.approvalRequestedAt || !receipt.approvalExpiresAt) {
      const requested = await append(input, receipt, "awaiting_approval", "not-started", {
        policy: receipt.policy,
        approval: currentApproval,
        approvalRequestedAt: requestedAt,
        approvalExpiresAt: expiresAt,
        approvalRequiredApprover: input.approval.requiredApprover,
        reasonCode: "approval-request-recorded",
      });
      receipt = requested.receipt;
      delivery = mergeDelivery(delivery, requested.delivery);
    }
    if (isExpired(receipt.approvalExpiresAt, input.facts.now())) {
      const expired = await append(input, receipt, "expired", "not-started", {
        policy: receipt.policy,
        approval: currentApproval,
        approvalRequestedAt: receipt.approvalRequestedAt,
        approvalExpiresAt: receipt.approvalExpiresAt,
        approvalRequiredApprover: receipt.approvalRequiredApprover,
        reasonCode: "approval-expired-before-decision",
      });
      return {
        status: "denied",
        receipt: expired.receipt,
        eventDelivery: mergeDelivery(delivery, expired.delivery),
      };
    }
    const request = {
      approval: currentApproval,
      requestedAt: receipt.approvalRequestedAt ?? requestedAt,
      expiresAt: receipt.approvalExpiresAt ?? expiresAt,
      requiredApprover: receipt.approvalRequiredApprover,
    };
    let decision: ApprovalDecision | null;
    try {
      decision = await input.approval.request(request);
    } catch {
      decision = null;
    }
    if (!decision) {
      return { status: "awaiting-approval", receipt, eventDelivery: delivery };
    }
    const verification = await verifyApproval({
      request,
      decision,
      authenticator: input.approval.authenticator,
      now: input.facts.now(),
    });
    if (verification.status !== "approved") {
      const terminalState =
        verification.reason === "expired" || verification.reason === "outside-approval-window"
          ? "expired"
          : "denied";
      const denied = await append(input, receipt, terminalState, "not-started", {
        policy: receipt.policy,
        approval: currentApproval,
        approvalRequestedAt: requestedAt,
        approvalExpiresAt: expiresAt,
        approvalRequiredApprover: receipt.approvalRequiredApprover,
        reasonCode: `approval-${verification.reason}`,
      });
      return {
        status: "denied",
        receipt: denied.receipt,
        eventDelivery: mergeDelivery(delivery, denied.delivery),
      };
    }
    const ready = await append(input, receipt, "ready", "not-started", {
      policy: receipt.policy,
      approval: currentApproval,
      approvalRequestedAt: requestedAt,
      approvalExpiresAt: expiresAt,
      approvalRequiredApprover: receipt.approvalRequiredApprover,
      authorizedEvidence: decision.authentication.evidence,
    });
    receipt = ready.receipt;
    delivery = mergeDelivery(delivery, ready.delivery);
  }

  if (control.isCancellationRequested()) {
    return cancelBeforeStart(input, receipt, delivery);
  }
  const concurrencyRequest: ConcurrencyRequest = {
    runId,
    toolCallId: input.call.toolCallId,
    mode: input.tool.definition.execution.concurrency,
  };
  const lease = await acquireInterruptibly(input, concurrencyRequest, control);
  if (!lease) {
    return cancelBeforeStart(input, receipt, delivery);
  }
  if (!leaseMatches(lease, concurrencyRequest)) {
    try {
      await lease.release();
    } catch {
      // The invalid lease is never used for execution.
    }
    throw new ToolExecutionCoordinationError("Concurrency gate returned a mismatched lease.");
  }

  const executionClaim = await claimExecutionFence(input, receipt);
  if (executionClaim.kind === "not-found") {
    await lease.release();
    throw new ToolExecutionCoordinationError(
      "Receipt disappeared before execution ownership was claimed.",
    );
  }
  if (executionClaim.kind === "held") {
    await lease.release();
    return {
      status: "held",
      receipt: executionClaim.receipt,
      eventDelivery: delivery,
    };
  }
  if (executionClaim.kind === "not-eligible") {
    await lease.release();
    return {
      status: "existing",
      receipt: executionClaim.receipt,
      eventDelivery: delivery,
    };
  }
  receipt = executionClaim.receipt;
  const executionFence = executionClaim.fence;

  let cancellationObserved = control.isCancellationRequested();
  let acceptingCancellation = true;
  let executionStarted = false;
  let cancellationPersistence = Promise.resolve();
  let unsubscribe = (): void => undefined;
  const stopCancellationObservation = (): void => {
    acceptingCancellation = false;
    try {
      unsubscribe();
    } catch {
      // The local linearization flag still prevents later callbacks from
      // racing the terminal journal transition.
    }
    unsubscribe = () => undefined;
  };
  try {
    unsubscribe = control.onCancellationRequested(() => {
      if (!acceptingCancellation || cancellationObserved) {
        return;
      }
      cancellationObserved = true;
      if (executionStarted) {
        cancellationPersistence = append(input, receipt, "started", receipt.effectDisposition, {
          cancellation: cancellationRef(input, receipt),
          reasonCode: "cancellation-requested-after-start",
        }).then(
          (pending) => {
            receipt = pending.receipt;
            delivery = mergeDelivery(delivery, pending.delivery);
          },
          () => undefined,
        );
      }
    });
    if (cancellationObserved) {
      return await cancelBeforeStart(input, receipt, delivery);
    }
    if (isExpired(receipt.approvalExpiresAt, input.facts.now())) {
      const expired = await append(input, receipt, "expired", "not-started", {
        policy: receipt.policy,
        approval: receipt.approval,
        approvalRequestedAt: receipt.approvalRequestedAt,
        approvalExpiresAt: receipt.approvalExpiresAt,
        approvalRequiredApprover: receipt.approvalRequiredApprover,
        reasonCode: "approval-expired-before-start",
      });
      return {
        status: "denied",
        receipt: expired.receipt,
        eventDelivery: mergeDelivery(delivery, expired.delivery),
      };
    }

    try {
      await verifySpecification(input);
    } catch {
      const denied = await append(input, receipt, "denied", "not-started", {
        reasonCode: "specification-authority-invalid",
      });
      return {
        status: "denied",
        receipt: denied.receipt,
        eventDelivery: mergeDelivery(delivery, denied.delivery),
      };
    }

    const started = await append(input, receipt, "started", isMeaningful ? "unknown" : "none");
    receipt = started.receipt;
    delivery = mergeDelivery(delivery, started.delivery);
    executionStarted = true;
    if (cancellationObserved) {
      const cancelled = await append(input, receipt, "failed_after_start", "none", {
        cancellation: cancellationRef(input, receipt),
        reasonCode: "cancellation-observed-before-invocation",
      });
      return {
        status: "cancelled",
        receipt: cancelled.receipt,
        eventDelivery: mergeDelivery(delivery, cancelled.delivery),
      };
    }

    try {
      await verifySpecification(input, bound);
    } catch {
      const denied = await append(input, receipt, "failed_after_start", "none", {
        reasonCode: "specification-authority-invalid-before-invocation",
      });
      return {
        status: "denied",
        receipt: denied.receipt,
        eventDelivery: mergeDelivery(delivery, denied.delivery),
      };
    }

    if (!(await fenceIsCurrent(input.journal, receipt, executionFence))) {
      return {
        status: "indeterminate",
        receipt,
        eventDelivery: delivery,
      };
    }

    try {
      const result = await input.tool.execute({
        call: input.call,
        control,
        receiptFence: Object.freeze({
          receiptId: receipt.receiptId,
          ownerId: executionFence.owner.ownerId,
          token: executionFence.token,
        }),
      });
      stopCancellationObservation();
      await cancellationPersistence;
      if (result.toolCallId !== input.call.toolCallId) {
        throw new ToolExecutionCoordinationError(
          "Tool result identity does not match the controlled call.",
        );
      }
      const cancellation = cancellationObserved ? cancellationRef(input, receipt) : undefined;
      if (result.status === "succeeded") {
        const succeeded = await append(
          input,
          receipt,
          "succeeded",
          isMeaningful ? "applied" : "none",
          {
            cancellation,
            reasonCode: cancellation ? "cancellation-requested-effect-completed" : undefined,
          },
        );
        return {
          status: "succeeded",
          result,
          receipt: succeeded.receipt,
          eventDelivery: mergeDelivery(delivery, succeeded.delivery),
        };
      }
      const failed = await append(
        input,
        receipt,
        "failed_after_start",
        isMeaningful ? "unknown" : "none",
        {
          cancellation,
          reasonCode: cancellation
            ? "cancellation-requested-effect-unconfirmed"
            : "tool-reported-failure",
        },
      );
      return {
        status: "failed",
        result,
        receipt: failed.receipt,
        eventDelivery: mergeDelivery(delivery, failed.delivery),
      };
    } catch {
      stopCancellationObservation();
      await cancellationPersistence;
      try {
        const indeterminate = await append(
          input,
          receipt,
          "indeterminate",
          isMeaningful ? "unknown" : "none",
          {
            cancellation: cancellationObserved ? cancellationRef(input, receipt) : undefined,
            reasonCode: cancellationObserved
              ? "cancellation-requested-execution-indeterminate"
              : "executor-threw-after-start",
          },
        );
        return {
          status: "indeterminate",
          receipt: indeterminate.receipt,
          eventDelivery: mergeDelivery(delivery, indeterminate.delivery),
        };
      } catch {
        // The durable started record is still authoritative. A lost/expired
        // fence cannot be overwritten by this worker; recovery must reconcile.
        return { status: "indeterminate", receipt, eventDelivery: delivery };
      }
    }
  } finally {
    stopCancellationObservation();
    try {
      await lease.release();
    } catch {
      // Lease cleanup cannot overwrite an authoritative durable outcome.
    }
  }
};
