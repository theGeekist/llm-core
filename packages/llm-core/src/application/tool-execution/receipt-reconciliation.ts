import { isCanonicalUuid, isSchemaRef, type EvidenceRef } from "#contracts";
import type {
  ToolExecutionReceipt,
  ToolReceiptReconciliationRecord,
  ToolReceiptReconciliationResult,
} from "../../features/evidence/public";
import { mergeDelivery } from "./event-projection";
import { mintedId } from "./execution-invariants";
import { appendReceipt, claimExecutionFence, fenceIsCurrent } from "./receipt-persistence";
import type {
  ControlledToolReceiptReconciliationOutcome,
  EventDelivery,
  ReconcileControlledToolReceiptInput,
} from "./types";

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
  let schema: EvidenceRef["schema"];
  if (hasSchema) {
    const schemaRecord = snapshotRecord(evidence.schema, ["schemaId", "version", "digest"]);
    const schemaDigest = snapshotRecord(schemaRecord?.digest, ["algorithm", "value"]);
    if (!schemaRecord || !schemaDigest) return null;
    const candidate = {
      schemaId: schemaRecord.schemaId,
      version: schemaRecord.version,
      digest: { algorithm: schemaDigest.algorithm, value: schemaDigest.value },
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

interface KnownReconciliationSettlement {
  readonly input: ReconcileControlledToolReceiptInput;
  readonly receipt: ToolExecutionReceipt;
  readonly delivery: EventDelivery;
  readonly reconciliation: ToolReceiptReconciliationRecord;
  readonly result: Extract<ToolReceiptReconciliationResult, { kind: "known" }>;
}

const settleKnownReconciliation = async ({
  input,
  receipt,
  delivery,
  reconciliation,
  result,
}: KnownReconciliationSettlement): Promise<ControlledToolReceiptReconciliationOutcome> => {
  const resolution =
    result.disposition === "applied"
      ? { state: "succeeded" as const, disposition: "applied" as const }
      : { state: "failed_after_start" as const, disposition: result.disposition };
  try {
    const settled = await appendReceipt(input, receipt, resolution.state, resolution.disposition, {
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
};

/** Reconcile an ambiguous durable effect without invoking its tool again. */
export const reconcileControlledToolReceipt = async (
  input: ReconcileControlledToolReceiptInput,
): Promise<ControlledToolReceiptReconciliationOutcome> => {
  const loaded = await input.journal.load({ receiptId: input.receiptId });
  if (loaded === null) return { status: "not-found", receiptId: input.receiptId };
  if (loaded.state !== "started" && loaded.state !== "indeterminate") {
    return { status: "not-eligible", receipt: loaded, eventDelivery: "not-configured" };
  }
  const claim = await claimExecutionFence(input, loaded);
  if (claim.kind === "not-found") return { status: "not-found", receiptId: input.receiptId };
  if (claim.kind === "held") {
    return { status: "held", receipt: claim.receipt, eventDelivery: "not-configured" };
  }
  if (claim.kind === "not-eligible") {
    return { status: "not-eligible", receipt: claim.receipt, eventDelivery: "not-configured" };
  }
  let receipt: ToolExecutionReceipt = claim.receipt;
  let delivery: EventDelivery = "not-configured";
  if (receipt.state === "started") {
    const indeterminate = await appendReceipt(input, receipt, "indeterminate", "unknown", {
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
  const requested = await appendReceipt(input, receipt, "indeterminate", "unknown", {
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
    const recorded = await appendReceipt(input, receipt, "indeterminate", "unknown", {
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
    return settleKnownReconciliation({ input, receipt, delivery, reconciliation, result });
  }
  try {
    const unresolved = await appendReceipt(input, receipt, "reconciliation_required", "unknown", {
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
