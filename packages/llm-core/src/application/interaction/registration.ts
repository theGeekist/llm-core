import {
  coreId,
  externalId,
  isCanonicalUuid,
  isExternalId,
  isJsonValue,
  type ConversationId,
  type EventId,
  type JsonValue,
  type ProviderSessionId,
  type RunId,
} from "#contracts";
import {
  createProviderSessionRef,
  createSnapshot,
} from "../../features/state/public";
import type {
  ConversationSessionSnapshot,
  ConversationSessionValue,
  ConversationTurn,
  InteractionProjection,
  InteractionRunStatus,
  InteractionUiEvent,
} from "./types";

const TERMINAL_STATUSES = ["completed", "failed", "denied", "cancelled"] as const;
const RUN_STATUSES = [
  "idle",
  "running",
  "awaiting-intervention",
  "cancellation-requested",
  ...TERMINAL_STATUSES,
] as const;
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

const eventId = (value: unknown): EventId => {
  if (!isCanonicalUuid(value)) {
    throw new TypeError("Conversation projection event IDs must be canonical UUIDs.");
  }
  return coreId<EventId>(value);
};

const runId = (value: unknown): RunId => {
  if (!isCanonicalUuid(value)) {
    throw new TypeError("Conversation run IDs must be canonical UUIDs.");
  }
  return coreId<RunId>(value);
};

const optionalReason = (value: unknown): string | null => {
  if (value === undefined) {
    return null;
  }
  return requiredString(value, "reasonCode");
};

// eslint-disable-next-line sonarjs/cognitive-complexity -- exhaustive closed-union registration is intentionally centralized
const normalizeUiEvent = (value: unknown): InteractionUiEvent => {
  if (!isRecord(value)) {
    throw new TypeError("Conversation projection events must be closed objects.");
  }
  const kind = requiredString(value.kind, "event kind");
  const common = { eventId: eventId(value.eventId), runId: runId(value.runId) };
  switch (kind) {
    case "run-started":
      if (!hasOnlyKeys(value, ["kind", "eventId", "runId", "agentId"])) {
        break;
      }
      return {
        kind,
        ...common,
        agentId: requiredString(value.agentId, "agentId"),
      };
    case "run-progress":
      if (!hasOnlyKeys(value, ["kind", "eventId", "runId", "code"])) {
        break;
      }
      return { kind, ...common, code: requiredString(value.code, "progress code") };
    case "intervention-requested":
      if (
        !hasOnlyKeys(value, [
          "kind",
          "eventId",
          "runId",
          "interventionId",
          "allowed",
          "expiresAt",
        ]) ||
        !Array.isArray(value.allowed) ||
        !value.allowed.every((item) => typeof item === "string")
      ) {
        break;
      }
      return {
        kind,
        ...common,
        interventionId: requiredString(value.interventionId, "interventionId"),
        allowed: [...value.allowed],
        expiresAt: requiredString(value.expiresAt, "expiresAt"),
      };
    case "cancellation-requested":
      if (!hasOnlyKeys(value, ["kind", "eventId", "runId"])) {
        break;
      }
      return { kind, ...common };
    case "tool-status": {
      if (
        !hasOnlyKeys(value, [
          "kind",
          "eventId",
          "runId",
          "toolCallId",
          "receiptState",
          "reasonCode",
        ]) ||
        !RECEIPT_STATES.includes(value.receiptState as (typeof RECEIPT_STATES)[number])
      ) {
        break;
      }
      const reasonCode = optionalReason(value.reasonCode);
      return {
        kind,
        ...common,
        toolCallId: requiredString(value.toolCallId, "toolCallId"),
        receiptState: value.receiptState as (typeof RECEIPT_STATES)[number],
        ...(reasonCode ? { reasonCode } : {}),
      };
    }
    case "run-finished": {
      if (
        !hasOnlyKeys(value, ["kind", "eventId", "runId", "status", "reasonCode"]) ||
        !TERMINAL_STATUSES.includes(value.status as (typeof TERMINAL_STATUSES)[number])
      ) {
        break;
      }
      const reasonCode = optionalReason(value.reasonCode);
      return {
        kind,
        ...common,
        status: value.status as (typeof TERMINAL_STATUSES)[number],
        ...(reasonCode ? { reasonCode } : {}),
      };
    }
    case "message-started":
    case "message-finished":
      if (!hasOnlyKeys(value, ["kind", "eventId", "runId", "messageId"])) {
        break;
      }
      return {
        kind,
        ...common,
        messageId: requiredString(value.messageId, "messageId"),
      };
    case "text-delta":
    case "reasoning-delta":
      if (!hasOnlyKeys(value, ["kind", "eventId", "runId", "messageId", "text"])) {
        break;
      }
      return {
        kind,
        ...common,
        messageId: requiredString(value.messageId, "messageId"),
        text: requiredString(value.text, "projected text"),
      };
    case "tool-call":
      if (
        !hasOnlyKeys(value, [
          "kind",
          "eventId",
          "runId",
          "messageId",
          "toolCallId",
          "toolName",
          "projectedInput",
        ]) ||
        !isJsonValue(value.projectedInput)
      ) {
        break;
      }
      return {
        kind,
        ...common,
        messageId: requiredString(value.messageId, "messageId"),
        toolCallId: requiredString(value.toolCallId, "toolCallId"),
        toolName: requiredString(value.toolName, "toolName"),
        projectedInput: structuredClone(value.projectedInput),
      };
    case "tool-result":
      if (
        !hasOnlyKeys(value, [
          "kind",
          "eventId",
          "runId",
          "messageId",
          "toolCallId",
          "toolName",
          "projectedResult",
          "isError",
        ]) ||
        !isJsonValue(value.projectedResult) ||
        typeof value.isError !== "boolean"
      ) {
        break;
      }
      return {
        kind,
        ...common,
        messageId: requiredString(value.messageId, "messageId"),
        toolCallId: requiredString(value.toolCallId, "toolCallId"),
        toolName: requiredString(value.toolName, "toolName"),
        projectedResult: structuredClone(value.projectedResult),
        isError: value.isError,
      };
    case "message-failed":
      if (
        !hasOnlyKeys(value, [
          "kind",
          "eventId",
          "runId",
          "messageId",
          "reasonCode",
        ])
      ) {
        break;
      }
      return {
        kind,
        ...common,
        messageId: requiredString(value.messageId, "messageId"),
        reasonCode: requiredString(value.reasonCode, "reasonCode"),
      };
  }
  throw new TypeError("Conversation projection events must use a closed safe shape.");
};

const normalizeProjection = (
  value: unknown,
  conversationId: ConversationId,
): InteractionProjection => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "conversationId",
      "status",
      "runId",
      "eventIds",
      "events",
      "lastSequences",
      "terminalRunIds",
    ]) ||
    value.conversationId !== conversationId ||
    !RUN_STATUSES.includes(value.status as InteractionRunStatus) ||
    !Array.isArray(value.eventIds) ||
    !Array.isArray(value.events) ||
    !isRecord(value.lastSequences) ||
    !Array.isArray(value.terminalRunIds)
  ) {
    throw new TypeError("Conversation snapshots require a closed interaction projection.");
  }
  const ids = value.eventIds.map(eventId);
  const events = value.events.map(normalizeUiEvent);
  const lastSequences = Object.fromEntries(
    Object.entries(value.lastSequences).map(([key, sequence]) => {
      if (!Number.isSafeInteger(sequence) || (sequence as number) < 0) {
        throw new TypeError("Conversation projection sequences must be non-negative integers.");
      }
      return [key, sequence as number];
    }),
  );
  const terminalRunIds = value.terminalRunIds.map(runId);
  if (
    events.some((event) => !ids.includes(event.eventId)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new TypeError("Conversation projection identity is inconsistent.");
  }
  return {
    conversationId,
    status: value.status as InteractionRunStatus,
    ...(value.runId === undefined ? {} : { runId: runId(value.runId) }),
    eventIds: ids,
    events,
    lastSequences,
    terminalRunIds,
  };
};

const normalizeTurn = (value: unknown): ConversationTurn => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["runId", "input", "status", "output", "reasonCode"]) ||
    !TERMINAL_STATUSES.includes(value.status as (typeof TERMINAL_STATUSES)[number]) ||
    !isJsonValue(value.input) ||
    (value.output !== undefined && !isJsonValue(value.output))
  ) {
    throw new TypeError("Conversation turns must be closed portable terminal records.");
  }
  const reasonCode = optionalReason(value.reasonCode);
  return {
    runId: runId(value.runId),
    input: structuredClone(value.input),
    status: value.status as (typeof TERMINAL_STATUSES)[number],
    ...(value.output === undefined
      ? {}
      : { output: structuredClone(value.output) as JsonValue }),
    ...(reasonCode ? { reasonCode } : {}),
  };
};

const normalizeValue = (
  value: unknown,
  expectedConversationId: ConversationId,
): ConversationSessionValue => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "conversationId",
      "revision",
      "turns",
      "projection",
      "providerSession",
    ]) ||
    value.conversationId !== expectedConversationId ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !Array.isArray(value.turns)
  ) {
    throw new TypeError("Conversation stores must return a matching closed session value.");
  }
  let providerSession;
  if (value.providerSession !== undefined) {
    if (
      !isRecord(value.providerSession) ||
      !hasOnlyKeys(value.providerSession, ["kind", "providerId", "sessionId"]) ||
      value.providerSession.kind !== "provider-session-ref" ||
      !isExternalId(value.providerSession.providerId) ||
      !isExternalId(value.providerSession.sessionId)
    ) {
      throw new TypeError("Stored provider sessions must be closed opaque references.");
    }
    providerSession = createProviderSessionRef({
      kind: "provider-session-ref",
      providerId: value.providerSession.providerId,
      sessionId: externalId<ProviderSessionId>(value.providerSession.sessionId),
    });
  }
  return {
    conversationId: expectedConversationId,
    revision: value.revision as number,
    turns: value.turns.map(normalizeTurn),
    projection: normalizeProjection(value.projection, expectedConversationId),
    ...(providerSession ? { providerSession } : {}),
  };
};

export const registerConversationSessionSnapshot = (
  input: unknown,
  expectedConversationId: ConversationId,
): ConversationSessionSnapshot => {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ["kind", "snapshotId", "createdAt", "schema", "value"]) ||
    input.kind !== "snapshot" ||
    !isExternalId(input.snapshotId) ||
    typeof input.createdAt !== "string"
  ) {
    throw new TypeError("Conversation stores must return a closed snapshot.");
  }
  const value = normalizeValue(input.value, expectedConversationId);
  return createSnapshot({
    snapshotId: input.snapshotId,
    createdAt: input.createdAt,
    ...(input.schema === undefined ? {} : { schema: input.schema as never }),
    value: value as unknown as JsonValue,
  }) as unknown as ConversationSessionSnapshot;
};
