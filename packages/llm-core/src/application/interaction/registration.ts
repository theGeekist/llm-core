import {
  coreId,
  externalId,
  isCanonicalUuid,
  isExternalId,
  isJsonValue,
  type ConversationId,
  type CorrelationId,
  type EventId,
  type JsonValue,
  type RunId,
} from "#contracts";
import { createSnapshot } from "../../features/state/public";
import {
  registerAgentOutput,
  registerNativeAgentConversationContinuity,
} from "../../features/agent/public";
import { isCanonicalInteractionTimestamp, isSafeInteractionCode } from "./content-registration";
import { registerInteractionProviderSession } from "./provider-session-registration";
import { registerConversationEvent } from "./ui-event-registration";
import type {
  ConversationSnapshot,
  ConversationState,
  ConversationRunRecord,
  InteractionAcceptedActiveInputIdentity,
  InteractionProjection,
  InteractionRunStatus,
} from "./types";

const TERMINAL_STATUSES = ["completed", "failed", "denied", "cancelled"] as const;
const RUN_STATUSES = [
  "idle",
  "running",
  "awaiting-intervention",
  "cancellation-requested",
  ...TERMINAL_STATUSES,
] as const;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const requiredSafeCode = (value: unknown, field: string): string => {
  if (!isSafeInteractionCode(value)) {
    throw new TypeError(`Conversation snapshot ${field} must be a safe code.`);
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
  return requiredSafeCode(value, "reasonCode");
};

const acceptedActiveInputIdentity = (value: unknown): InteractionAcceptedActiveInputIdentity => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["runId", "messageId", "correlationId"]) ||
    !isExternalId(value.messageId) ||
    !isExternalId(value.correlationId)
  ) {
    throw new TypeError(
      "Stored active-input indexes require exact run, message and correlation identity.",
    );
  }
  return {
    runId: runId(value.runId),
    messageId: value.messageId,
    correlationId: externalId<CorrelationId>(value.correlationId),
  };
};

interface StoredProjection extends Record<string, unknown> {
  readonly conversationId: unknown;
  readonly status: InteractionRunStatus;
  readonly runId: unknown;
  readonly eventIds: unknown[];
  readonly eventFingerprints: Record<string, unknown>;
  readonly events: unknown[];
  readonly lastSequences: Record<string, unknown>;
  readonly terminalRunIds: unknown[];
  readonly terminalMessageKeys: unknown[];
  readonly startedMessageKeys: unknown[];
  readonly seenToolCallKeys: unknown[];
  readonly acceptedActiveInputs: unknown[];
}

interface DerivedProjectionIndexes {
  readonly terminalRunIds: RunId[];
  readonly terminalMessageKeys: string[];
  readonly startedMessageKeys: string[];
  readonly seenToolCallKeys: string[];
  readonly acceptedActiveInputs: InteractionAcceptedActiveInputIdentity[];
  readonly closedMessageKeys: Set<string>;
}

const isInteractionRunStatus = (value: unknown): value is InteractionRunStatus =>
  RUN_STATUSES.includes(value as InteractionRunStatus);

const interactionRunStatus = (value: unknown): InteractionRunStatus => {
  const status = RUN_STATUSES.find((candidate) => candidate === value);
  if (status === undefined) {
    throw new TypeError("Conversation snapshot status must be a closed run status.");
  }
  return status;
};

const requireProjectionShape: (
  value: unknown,
  conversationId: ConversationId,
) => asserts value is StoredProjection = (value, conversationId) => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "conversationId",
      "status",
      "runId",
      "eventIds",
      "eventFingerprints",
      "events",
      "lastSequences",
      "terminalRunIds",
      "terminalMessageKeys",
      "startedMessageKeys",
      "seenToolCallKeys",
      "acceptedActiveInputs",
    ]) ||
    value.conversationId !== conversationId ||
    !isInteractionRunStatus(value.status) ||
    !Array.isArray(value.eventIds) ||
    !Array.isArray(value.events) ||
    !isRecord(value.eventFingerprints) ||
    !isRecord(value.lastSequences) ||
    !Array.isArray(value.terminalRunIds) ||
    !Array.isArray(value.terminalMessageKeys) ||
    !Array.isArray(value.startedMessageKeys) ||
    !Array.isArray(value.seenToolCallKeys) ||
    !Array.isArray(value.acceptedActiveInputs)
  ) {
    throw new TypeError("Conversation snapshots require a closed interaction projection.");
  }
};

const registerProjectionEvents = (
  value: StoredProjection,
): { readonly ids: EventId[]; readonly events: ReturnType<typeof registerConversationEvent>[] } => {
  const ids = value.eventIds.map(eventId);
  const events = value.events.map(registerConversationEvent);
  const projectedIds = events.map((event) => event.eventId);
  if (
    Object.keys(value.eventFingerprints).length > 0 ||
    Object.keys(value.lastSequences).length > 0 ||
    ids.length !== projectedIds.length ||
    ids.some((id, index) => id !== projectedIds[index]) ||
    new Set(ids).size !== ids.length
  ) {
    throw new TypeError("Stored projection indexes must be canonical and reconstructable.");
  }
  return { ids, events };
};

const requireAcceptedActiveInput = (
  indexes: DerivedProjectionIndexes,
  event: ReturnType<typeof registerConversationEvent>,
): void => {
  if (
    event.kind !== "active-input-recipient-observed" &&
    event.kind !== "active-input-processing-observed" &&
    event.kind !== "active-input-evidence-unavailable"
  ) {
    return;
  }
  const accepted = indexes.acceptedActiveInputs.some(
    (identity) =>
      identity.runId === event.runId &&
      identity.messageId === event.messageId &&
      identity.correlationId === event.correlationId,
  );
  if (!accepted) {
    throw new TypeError(
      "Stored active-input evidence requires the exact prior accepted message and correlation.",
    );
  }
};

const recordActiveInput = (
  indexes: DerivedProjectionIndexes,
  event: ReturnType<typeof registerConversationEvent>,
): void => {
  if (event.kind !== "active-input-accepted") {
    requireAcceptedActiveInput(indexes, event);
    return;
  }
  const duplicate = indexes.acceptedActiveInputs.some(
    (identity) =>
      identity.runId === event.runId &&
      (identity.messageId === event.messageId || identity.correlationId === event.correlationId),
  );
  if (duplicate) {
    throw new TypeError(
      "Stored active-input acceptance cannot reuse a message or correlation within one run.",
    );
  }
  indexes.acceptedActiveInputs.push({
    runId: event.runId,
    messageId: event.messageId,
    correlationId: event.correlationId,
  });
};

const requireOpenMessagesSettled = (
  indexes: DerivedProjectionIndexes,
  event: ReturnType<typeof registerConversationEvent>,
): void => {
  if (event.kind !== "run-finished") {
    return;
  }
  const hasOpenMessage = indexes.startedMessageKeys.some(
    (key) => key.startsWith(`${event.runId}:`) && !indexes.closedMessageKeys.has(key),
  );
  if (hasOpenMessage) {
    throw new TypeError("Stored projections cannot terminate a run with an open content message.");
  }
};

const messageKey = (event: ReturnType<typeof registerConversationEvent>): string | null => {
  switch (event.kind) {
    case "message-started":
    case "text-delta":
    case "reasoning-delta":
    case "tool-call":
    case "tool-result":
    case "message-finished":
    case "message-failed":
      return `${event.runId}:${event.messageId}`;
    default:
      return null;
  }
};

const recordMessageEvent = (
  indexes: DerivedProjectionIndexes,
  event: ReturnType<typeof registerConversationEvent>,
): void => {
  const key = messageKey(event);
  if (key === null) {
    return;
  }
  if (indexes.closedMessageKeys.has(key)) {
    throw new TypeError("Stored projection content follows a terminal message.");
  }
  if (event.kind === "message-started") {
    if (indexes.startedMessageKeys.includes(key)) {
      throw new TypeError("Stored projection messages can start exactly once.");
    }
    indexes.startedMessageKeys.push(key);
    return;
  }
  if (!indexes.startedMessageKeys.includes(key)) {
    throw new TypeError("Stored projection content requires a preceding message start.");
  }
  if (event.kind === "tool-call") {
    const toolKey = `${event.runId}:${event.toolCallId}`;
    if (indexes.seenToolCallKeys.includes(toolKey)) {
      throw new TypeError("Stored projection tool calls must be unique.");
    }
    indexes.seenToolCallKeys.push(toolKey);
    return;
  }
  if (
    event.kind === "tool-result" &&
    !indexes.seenToolCallKeys.includes(`${event.runId}:${event.toolCallId}`)
  ) {
    throw new TypeError("Stored projection tool results require a preceding call.");
  }
  if (event.kind === "message-finished" || event.kind === "message-failed") {
    indexes.closedMessageKeys.add(key);
  }
};

const deriveProjectionIndexes = (
  events: readonly ReturnType<typeof registerConversationEvent>[],
): DerivedProjectionIndexes => {
  const indexes: DerivedProjectionIndexes = {
    terminalRunIds: [
      ...new Set(
        events.filter((event) => event.kind === "run-finished").map((event) => event.runId),
      ),
    ],
    terminalMessageKeys: [
      ...new Set(
        events
          .filter((event) => event.kind === "message-finished" || event.kind === "message-failed")
          .map((event) => `${event.runId}:${event.messageId}`),
      ),
    ],
    startedMessageKeys: [],
    seenToolCallKeys: [],
    acceptedActiveInputs: [],
    closedMessageKeys: new Set<string>(),
  };
  for (const event of events) {
    requireOpenMessagesSettled(indexes, event);
    recordActiveInput(indexes, event);
    recordMessageEvent(indexes, event);
  }
  return indexes;
};

const sameAcceptedInputs = (
  stored: readonly InteractionAcceptedActiveInputIdentity[],
  derived: readonly InteractionAcceptedActiveInputIdentity[],
): boolean =>
  stored.length === derived.length &&
  stored.every((identity, index) => {
    const counterpart = derived[index];
    return (
      counterpart !== undefined &&
      identity.runId === counterpart.runId &&
      identity.messageId === counterpart.messageId &&
      identity.correlationId === counterpart.correlationId
    );
  });

const sameOrderedValues = (stored: readonly unknown[], derived: readonly unknown[]): boolean =>
  stored.length === derived.length && stored.every((item, index) => item === derived[index]);

const requireMatchingIndexes = (
  value: StoredProjection,
  indexes: DerivedProjectionIndexes,
): RunId[] => {
  const terminalRunIds = value.terminalRunIds.map(runId);
  const acceptedActiveInputs = value.acceptedActiveInputs.map(acceptedActiveInputIdentity);
  if (
    !sameOrderedValues(terminalRunIds, indexes.terminalRunIds) ||
    !sameOrderedValues(value.terminalMessageKeys, indexes.terminalMessageKeys) ||
    !sameOrderedValues(value.startedMessageKeys, indexes.startedMessageKeys) ||
    !sameOrderedValues(value.seenToolCallKeys, indexes.seenToolCallKeys) ||
    !sameAcceptedInputs(acceptedActiveInputs, indexes.acceptedActiveInputs)
  ) {
    throw new TypeError(
      "Stored projection terminal indexes or active-input lifecycle indexes are inconsistent.",
    );
  }
  return terminalRunIds;
};

const requireMatchingStatus = (
  value: StoredProjection,
  events: readonly ReturnType<typeof registerConversationEvent>[],
): void => {
  const lastTerminal = events.findLast((event) => event.kind === "run-finished");
  if (
    (lastTerminal === undefined && (value.status !== "idle" || value.runId !== undefined)) ||
    (lastTerminal !== undefined &&
      (value.status !== lastTerminal.status || value.runId !== lastTerminal.runId))
  ) {
    throw new TypeError("Stored projection status must match its terminal event.");
  }
};

const normalizeProjection = (
  value: unknown,
  conversationId: ConversationId,
): InteractionProjection => {
  requireProjectionShape(value, conversationId);
  const { ids, events } = registerProjectionEvents(value);
  const indexes = deriveProjectionIndexes(events);
  const terminalRunIds = requireMatchingIndexes(value, indexes);
  requireMatchingStatus(value, events);
  return {
    conversationId,
    status: interactionRunStatus(value.status),
    ...(value.runId === undefined ? {} : { runId: runId(value.runId) }),
    eventIds: ids,
    eventFingerprints: {},
    events,
    lastSequences: {},
    terminalRunIds,
    terminalMessageKeys: [...indexes.terminalMessageKeys],
    startedMessageKeys: [...indexes.startedMessageKeys],
    seenToolCallKeys: [...indexes.seenToolCallKeys],
    acceptedActiveInputs: indexes.acceptedActiveInputs,
  };
};

const normalizeTurn = (value: unknown): ConversationRunRecord => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["runId", "input", "status", "output", "reasonCode"]) ||
    !TERMINAL_STATUSES.includes(value.status as (typeof TERMINAL_STATUSES)[number]) ||
    !isJsonValue(value.input)
  ) {
    throw new TypeError("Conversation turns must be closed portable terminal records.");
  }
  const reasonCode = optionalReason(value.reasonCode);
  return {
    runId: runId(value.runId),
    input: structuredClone(value.input),
    status: value.status as (typeof TERMINAL_STATUSES)[number],
    ...(value.output === undefined ? {} : { output: registerAgentOutput(value.output) }),
    ...(reasonCode ? { reasonCode } : {}),
  };
};

const normalizeValue = (
  value: unknown,
  expectedConversationId: ConversationId,
): ConversationState => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "conversationId",
      "revision",
      "turns",
      "projection",
      "providerSession",
      "nativeConversation",
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
    providerSession = registerInteractionProviderSession(value.providerSession);
  }
  const nativeConversation =
    value.nativeConversation === undefined
      ? undefined
      : registerNativeAgentConversationContinuity(value.nativeConversation);
  if (
    nativeConversation &&
    (!providerSession || providerSession.providerId !== nativeConversation.providerId)
  ) {
    throw new TypeError(
      "Native-agent continuity requires a matching opaque provider-session reference.",
    );
  }
  return {
    conversationId: expectedConversationId,
    revision: value.revision as number,
    turns: value.turns.map(normalizeTurn),
    projection: normalizeProjection(value.projection, expectedConversationId),
    ...(providerSession ? { providerSession } : {}),
    ...(nativeConversation ? { nativeConversation } : {}),
  };
};

export const registerConversationSnapshot = (
  input: unknown,
  expectedConversationId: ConversationId,
): ConversationSnapshot => {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ["kind", "snapshotId", "createdAt", "schema", "value"]) ||
    input.kind !== "snapshot" ||
    !isExternalId(input.snapshotId) ||
    !isCanonicalInteractionTimestamp(input.createdAt)
  ) {
    throw new TypeError("Conversation stores must return a closed snapshot.");
  }
  const value = normalizeValue(input.value, expectedConversationId);
  return createSnapshot({
    snapshotId: input.snapshotId,
    createdAt: input.createdAt,
    ...(input.schema === undefined ? {} : { schema: input.schema as never }),
    value: value as unknown as JsonValue,
  }) as unknown as ConversationSnapshot;
};
