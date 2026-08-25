import {
  coreId,
  externalId,
  isCanonicalUuid,
  isExternalId,
  type CorrelationId,
  type EventId,
  type JsonValue,
  type RunId,
} from "#contracts";
import type { ConversationEvent } from "./types";
import {
  isCanonicalInteractionTimestamp,
  isSafeInteractionCode,
  isSafeInteractionProjectionJson,
} from "./content-registration";

const TERMINAL_STATUSES = ["completed", "failed", "denied", "cancelled"] as const;
const RECEIPT_STATES = [
  "reserved",
  "awaiting_policy",
  "awaiting_approval",
  "ready",
  "started",
  "denied",
  "expired",
  "cancelled_before_start",
  "succeeded",
  "failed_after_start",
  "indeterminate",
  "reconciliation_required",
  "compensation_required",
  "compensating",
  "compensated",
  "compensation_failed",
] as const;
const INTERVENTION_DECISIONS = ["approve", "deny", "defer", "edit", "cancel", "escalate"] as const;
const ACTIVE_INPUT_DELIVERY_MODES = ["native-live", "execution-boundary"] as const;
const ACTIVE_INPUT_EVIDENCE_STAGES = ["recipient-observation", "semantic-processing"] as const;
const ACTIVE_INPUT_UNAVAILABLE_REASONS = [
  "provider-unobservable",
  "evidence-not-retained",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Conversation snapshot ${field} must be a non-empty string.`);
  }
  return value;
};

const requiredExternalId = (value: unknown, field: string): string => {
  if (!isExternalId(value)) {
    throw new TypeError(`Conversation snapshot ${field} must be an opaque external ID.`);
  }
  return value;
};

const requiredSafeCode = (value: unknown, field: string): string => {
  if (!isSafeInteractionCode(value)) {
    throw new TypeError(`Conversation snapshot ${field} must be a safe code.`);
  }
  return value;
};

const requiredTimestamp = (value: unknown, field: string): string => {
  if (!isCanonicalInteractionTimestamp(value)) {
    throw new TypeError(`Conversation snapshot ${field} must be a canonical timestamp.`);
  }
  return value;
};

const requiredCorrelationId = (value: unknown): CorrelationId =>
  externalId<CorrelationId>(requiredExternalId(value, "correlationId"));

const canonicalId = (value: unknown, field: string): string => {
  if (!isCanonicalUuid(value)) {
    throw new TypeError(`Conversation snapshot ${field} must be a canonical UUID.`);
  }
  return value;
};

const commonIdentity = (value: Record<string, unknown>): { eventId: EventId; runId: RunId } => ({
  eventId: coreId<EventId>(canonicalId(value.eventId, "eventId")),
  runId: coreId<RunId>(canonicalId(value.runId, "runId")),
});

const optionalReason = (value: unknown): string | null =>
  value === undefined ? null : requiredSafeCode(value, "reasonCode");

const invalidConversationEvent = (): never => {
  throw new TypeError("Conversation projection events must use a closed safe shape.");
};

const requireOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): void => {
  if (!hasOnlyKeys(value, keys)) {
    invalidConversationEvent();
  }
};

const requiredMember = <const TChoices extends readonly string[]>(
  value: unknown,
  choices: TChoices,
): TChoices[number] => {
  return choices.find((choice) => choice === value) ?? invalidConversationEvent();
};

const requiredProjectionJson = (value: unknown): JsonValue => {
  if (isSafeInteractionProjectionJson(value)) {
    return structuredClone(value);
  }
  return invalidConversationEvent();
};

const requiredBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  return invalidConversationEvent();
};

const allowedDecisions = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new TypeError("Conversation snapshot intervention decisions must be closed.");
  }
  const decisions = value.map((entry) => requiredString(entry, "intervention decision"));
  if (
    decisions.length === 0 ||
    new Set(decisions).size !== decisions.length ||
    !decisions.every((entry) => INTERVENTION_DECISIONS.includes(entry as never))
  ) {
    throw new TypeError("Conversation snapshot intervention decisions must be closed.");
  }
  return decisions;
};

export const registerConversationEvent = (value: unknown): ConversationEvent => {
  if (!isRecord(value)) {
    throw new TypeError("Conversation projection events must be closed objects.");
  }
  const kind = requiredString(value.kind, "event kind");
  const common = commonIdentity(value);
  switch (kind) {
    case "run-started": {
      requireOnlyKeys(value, ["kind", "eventId", "runId", "agentId"]);
      return { kind, ...common, agentId: requiredExternalId(value.agentId, "agentId") };
    }
    case "run-progress": {
      requireOnlyKeys(value, ["kind", "eventId", "runId", "code"]);
      return { kind, ...common, code: requiredSafeCode(value.code, "progress code") };
    }
    case "intervention-requested": {
      requireOnlyKeys(value, [
        "kind",
        "eventId",
        "runId",
        "interventionId",
        "allowed",
        "expiresAt",
      ]);
      return {
        kind,
        ...common,
        interventionId: canonicalId(value.interventionId, "interventionId"),
        allowed: allowedDecisions(value.allowed),
        expiresAt: requiredTimestamp(value.expiresAt, "expiresAt"),
      };
    }
    case "cancellation-requested": {
      requireOnlyKeys(value, ["kind", "eventId", "runId"]);
      return { kind, ...common };
    }
    case "active-input-accepted": {
      requireOnlyKeys(value, [
        "kind",
        "eventId",
        "runId",
        "messageId",
        "correlationId",
        "acceptedAt",
        "deliveryMode",
      ]);
      return {
        kind,
        ...common,
        messageId: requiredExternalId(value.messageId, "messageId"),
        correlationId: requiredCorrelationId(value.correlationId),
        acceptedAt: requiredTimestamp(value.acceptedAt, "acceptedAt"),
        deliveryMode: requiredMember(value.deliveryMode, ACTIVE_INPUT_DELIVERY_MODES),
      };
    }
    case "active-input-recipient-observed": {
      requireOnlyKeys(value, [
        "kind",
        "eventId",
        "runId",
        "messageId",
        "correlationId",
        "observedAt",
        "evidenceRef",
      ]);
      return {
        kind,
        ...common,
        messageId: requiredExternalId(value.messageId, "messageId"),
        correlationId: requiredCorrelationId(value.correlationId),
        observedAt: requiredTimestamp(value.observedAt, "observedAt"),
        evidenceRef: requiredExternalId(value.evidenceRef, "evidenceRef"),
      };
    }
    case "active-input-processing-observed": {
      requireOnlyKeys(value, [
        "kind",
        "eventId",
        "runId",
        "messageId",
        "correlationId",
        "observedAt",
        "causationRef",
      ]);
      return {
        kind,
        ...common,
        messageId: requiredExternalId(value.messageId, "messageId"),
        correlationId: requiredCorrelationId(value.correlationId),
        observedAt: requiredTimestamp(value.observedAt, "observedAt"),
        causationRef: requiredExternalId(value.causationRef, "causationRef"),
      };
    }
    case "active-input-evidence-unavailable": {
      requireOnlyKeys(value, [
        "kind",
        "eventId",
        "runId",
        "messageId",
        "correlationId",
        "stage",
        "declaredAt",
        "reasonCode",
      ]);
      return {
        kind,
        ...common,
        messageId: requiredExternalId(value.messageId, "messageId"),
        correlationId: requiredCorrelationId(value.correlationId),
        stage: requiredMember(value.stage, ACTIVE_INPUT_EVIDENCE_STAGES),
        declaredAt: requiredTimestamp(value.declaredAt, "declaredAt"),
        reasonCode: requiredMember(value.reasonCode, ACTIVE_INPUT_UNAVAILABLE_REASONS),
      };
    }
    case "tool-status": {
      requireOnlyKeys(value, [
        "kind",
        "eventId",
        "runId",
        "toolCallId",
        "receiptState",
        "reasonCode",
      ]);
      const reasonCode = optionalReason(value.reasonCode);
      return {
        kind,
        ...common,
        toolCallId: canonicalId(value.toolCallId, "toolCallId"),
        receiptState: requiredMember(value.receiptState, RECEIPT_STATES),
        ...(reasonCode ? { reasonCode } : {}),
      };
    }
    case "run-finished": {
      requireOnlyKeys(value, ["kind", "eventId", "runId", "status", "reasonCode"]);
      const reasonCode = optionalReason(value.reasonCode);
      return {
        kind,
        ...common,
        status: requiredMember(value.status, TERMINAL_STATUSES),
        ...(reasonCode ? { reasonCode } : {}),
      };
    }
    case "message-started":
    case "message-finished": {
      requireOnlyKeys(value, ["kind", "eventId", "runId", "messageId"]);
      return {
        kind,
        ...common,
        messageId: requiredExternalId(value.messageId, "messageId"),
      };
    }
    case "text-delta":
    case "reasoning-delta": {
      requireOnlyKeys(value, ["kind", "eventId", "runId", "messageId", "text"]);
      return {
        kind,
        ...common,
        messageId: requiredExternalId(value.messageId, "messageId"),
        text: requiredString(value.text, "projected text"),
      };
    }
    case "tool-call": {
      requireOnlyKeys(value, [
        "kind",
        "eventId",
        "runId",
        "messageId",
        "toolCallId",
        "toolName",
        "projectedInput",
      ]);
      return {
        kind,
        ...common,
        messageId: requiredExternalId(value.messageId, "messageId"),
        toolCallId: requiredExternalId(value.toolCallId, "toolCallId"),
        toolName: requiredExternalId(value.toolName, "toolName"),
        projectedInput: requiredProjectionJson(value.projectedInput),
      };
    }
    case "tool-result": {
      requireOnlyKeys(value, [
        "kind",
        "eventId",
        "runId",
        "messageId",
        "toolCallId",
        "toolName",
        "projectedResult",
        "isError",
      ]);
      return {
        kind,
        ...common,
        messageId: requiredExternalId(value.messageId, "messageId"),
        toolCallId: requiredExternalId(value.toolCallId, "toolCallId"),
        toolName: requiredExternalId(value.toolName, "toolName"),
        projectedResult: requiredProjectionJson(value.projectedResult),
        isError: requiredBoolean(value.isError),
      };
    }
    case "message-failed": {
      requireOnlyKeys(value, ["kind", "eventId", "runId", "messageId", "reasonCode"]);
      return {
        kind,
        ...common,
        messageId: requiredExternalId(value.messageId, "messageId"),
        reasonCode: requiredSafeCode(value.reasonCode, "reasonCode"),
      };
    }
    default:
      return invalidConversationEvent();
  }
};
