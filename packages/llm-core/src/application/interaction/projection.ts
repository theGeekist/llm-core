import type { ConversationId } from "#contracts";
import type {
  InteractionEvent,
  InteractionProjection,
  InteractionRunStatus,
  ConversationEvent,
} from "./types";
import { interactionEventId, interactionRunId, interactionSequenceKey } from "./events";

const terminalStatus = (event: InteractionEvent): InteractionRunStatus | null => {
  if (event.kind !== "agent-run") {
    return null;
  }
  switch (event.event.kind) {
    case "agent.run.completed":
      return "completed";
    case "agent.run.failed":
      return "failed";
    case "agent.run.denied":
      return "denied";
    case "agent.run.cancelled":
      return "cancelled";
    default:
      return null;
  }
};

export const createInteractionProjection = (
  conversationId: ConversationId,
): InteractionProjection =>
  Object.freeze({
    conversationId,
    status: "idle",
    eventIds: Object.freeze([]),
    eventFingerprints: Object.freeze({}),
    events: Object.freeze([]),
    lastSequences: Object.freeze({}),
    terminalRunIds: Object.freeze([]),
    terminalMessageKeys: Object.freeze([]),
    startedMessageKeys: Object.freeze([]),
    seenToolCallKeys: Object.freeze([]),
  });

export const projectInteractionEvent = (event: InteractionEvent): ConversationEvent | null => {
  const eventId = interactionEventId(event);
  const runId = interactionRunId(event);
  if (event.kind === "content") {
    switch (event.event.kind) {
      case "interaction.message.started":
        return Object.freeze({
          kind: "message-started",
          eventId,
          runId,
          messageId: event.event.facts.messageId,
        });
      case "interaction.message.text.delta":
      case "interaction.message.reasoning.delta":
        return Object.freeze({
          kind:
            event.event.kind === "interaction.message.text.delta"
              ? "text-delta"
              : "reasoning-delta",
          eventId,
          runId,
          messageId: event.event.facts.messageId,
          text: event.event.facts.text,
        });
      case "interaction.message.tool.call":
        return Object.freeze({
          kind: "tool-call",
          eventId,
          runId,
          messageId: event.event.facts.messageId,
          toolCallId: event.event.facts.toolCallId,
          toolName: event.event.facts.toolName,
          projectedInput: event.event.facts.projectedInput,
        });
      case "interaction.message.tool.result":
        return Object.freeze({
          kind: "tool-result",
          eventId,
          runId,
          messageId: event.event.facts.messageId,
          toolCallId: event.event.facts.toolCallId,
          toolName: event.event.facts.toolName,
          projectedResult: event.event.facts.projectedResult,
          isError: event.event.facts.isError,
        });
      case "interaction.message.completed":
        return Object.freeze({
          kind: "message-finished",
          eventId,
          runId,
          messageId: event.event.facts.messageId,
        });
      case "interaction.message.failed":
        return Object.freeze({
          kind: "message-failed",
          eventId,
          runId,
          messageId: event.event.facts.messageId,
          reasonCode: event.event.facts.reasonCode,
        });
      default:
        throw new TypeError("Unknown interaction content event kind.");
    }
  }
  if (event.kind === "tool-execution") {
    return Object.freeze({
      kind: "tool-status",
      eventId,
      runId,
      toolCallId: event.event.toolCallId,
      receiptState: event.event.facts.receiptState,
      ...(event.event.facts.reasonCode ? { reasonCode: event.event.facts.reasonCode } : {}),
    });
  }
  switch (event.event.kind) {
    case "agent.run.started":
      return Object.freeze({
        kind: "run-started",
        eventId,
        runId,
        agentId: event.event.facts.agentId,
      });
    case "agent.run.progress":
      return Object.freeze({
        kind: "run-progress",
        eventId,
        runId,
        code: event.event.facts.code,
      });
    case "agent.run.intervention.requested":
      return Object.freeze({
        kind: "intervention-requested",
        eventId,
        runId,
        interventionId: event.event.facts.interventionId,
        allowed: Object.freeze([...event.event.facts.allowed]),
        expiresAt: event.event.facts.expiresAt,
      });
    case "agent.run.cancellation.requested":
      return Object.freeze({ kind: "cancellation-requested", eventId, runId });
    case "agent.run.completed":
    case "agent.run.failed":
    case "agent.run.denied":
    case "agent.run.cancelled":
      return Object.freeze({
        kind: "run-finished",
        eventId,
        runId,
        status: event.event.facts.status,
        ...(event.event.facts.reasonCode ? { reasonCode: event.event.facts.reasonCode } : {}),
      });
    case "agent.run.intervention.received":
    case "agent.run.cancellation.acknowledged":
      return null;
    default:
      throw new TypeError("Unknown agent event kind.");
  }
};

export const reduceInteractionProjection = (
  state: InteractionProjection,
  event: InteractionEvent,
  // eslint-disable-next-line sonarjs/cognitive-complexity -- ordering and terminal guards form one reducer transition
): InteractionProjection => {
  if (event.conversationId !== state.conversationId) {
    throw new TypeError("Interaction events cannot cross conversation boundaries.");
  }
  const eventId = interactionEventId(event);
  const fingerprint = JSON.stringify(event);
  const priorFingerprint = state.eventFingerprints[eventId];
  if (priorFingerprint !== undefined) {
    if (priorFingerprint === fingerprint) {
      return state;
    }
    throw new TypeError("Interaction event IDs cannot identify conflicting facts.");
  }
  const runId = interactionRunId(event);
  if (state.terminalRunIds.includes(runId)) {
    throw new TypeError("Interaction events cannot follow a terminal run event.");
  }
  if (
    terminalStatus(event) !== null &&
    state.startedMessageKeys.some(
      (key) => key.startsWith(`${runId}:`) && !state.terminalMessageKeys.includes(key),
    )
  ) {
    throw new TypeError("Interaction runs cannot terminate while a content message remains open.");
  }
  const messageKey = event.kind === "content" ? `${runId}:${event.event.facts.messageId}` : null;
  if (messageKey && state.terminalMessageKeys.includes(messageKey)) {
    throw new TypeError("Interaction content cannot follow a terminal message event.");
  }
  const startsMessage =
    event.kind === "content" && event.event.kind === "interaction.message.started";
  if (messageKey && startsMessage && state.startedMessageKeys.includes(messageKey)) {
    throw new TypeError("Interaction messages can start exactly once.");
  }
  if (messageKey && !startsMessage && !state.startedMessageKeys.includes(messageKey)) {
    throw new TypeError("Interaction message content requires a preceding start event.");
  }
  const toolCallKey =
    event.kind === "content" &&
    (event.event.kind === "interaction.message.tool.call" ||
      event.event.kind === "interaction.message.tool.result")
      ? `${runId}:${event.event.facts.toolCallId}`
      : null;
  if (
    toolCallKey &&
    event.kind === "content" &&
    event.event.kind === "interaction.message.tool.call" &&
    state.seenToolCallKeys.includes(toolCallKey)
  ) {
    throw new TypeError("Interaction tool calls can be projected exactly once.");
  }
  if (
    toolCallKey &&
    event.kind === "content" &&
    event.event.kind === "interaction.message.tool.result" &&
    !state.seenToolCallKeys.includes(toolCallKey)
  ) {
    throw new TypeError("Interaction tool results require a preceding tool call.");
  }
  const sequenceKey = interactionSequenceKey(event);
  const lastSequence = state.lastSequences[sequenceKey];
  if (lastSequence !== undefined && event.event.sequence <= lastSequence) {
    throw new TypeError("Interaction event sequences must increase monotonically.");
  }
  const projected = projectInteractionEvent(event);
  let status: InteractionRunStatus = terminalStatus(event) ?? state.status;
  if (event.kind === "agent-run") {
    if (event.event.kind === "agent.run.started") {
      status = "running";
    } else if (event.event.kind === "agent.run.intervention.requested") {
      status = "awaiting-intervention";
    } else if (event.event.kind === "agent.run.intervention.received") {
      status = "running";
    } else if (event.event.kind === "agent.run.cancellation.requested") {
      status = "cancellation-requested";
    }
  }
  return Object.freeze({
    conversationId: state.conversationId,
    status,
    runId,
    eventIds: Object.freeze([...state.eventIds, eventId]),
    eventFingerprints: Object.freeze({
      ...state.eventFingerprints,
      [eventId]: fingerprint,
    }),
    events: projected ? Object.freeze([...state.events, projected]) : state.events,
    lastSequences: Object.freeze({
      ...state.lastSequences,
      [sequenceKey]: event.event.sequence,
    }),
    terminalRunIds:
      terminalStatus(event) === null
        ? state.terminalRunIds
        : Object.freeze([...state.terminalRunIds, runId]),
    terminalMessageKeys:
      messageKey &&
      event.kind === "content" &&
      (event.event.kind === "interaction.message.completed" ||
        event.event.kind === "interaction.message.failed")
        ? Object.freeze([...state.terminalMessageKeys, messageKey])
        : state.terminalMessageKeys,
    startedMessageKeys:
      messageKey && startsMessage
        ? Object.freeze([...state.startedMessageKeys, messageKey])
        : state.startedMessageKeys,
    seenToolCallKeys:
      toolCallKey &&
      event.kind === "content" &&
      event.event.kind === "interaction.message.tool.call"
        ? Object.freeze([...state.seenToolCallKeys, toolCallKey])
        : state.seenToolCallKeys,
  });
};
