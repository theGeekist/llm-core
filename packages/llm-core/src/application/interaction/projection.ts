import type { ConversationId } from "#contracts";
import type {
  InteractionEvent,
  InteractionProjection,
  InteractionRunStatus,
  InteractionUiEvent,
} from "./types";
import {
  interactionEventId,
  interactionRunId,
  interactionSequenceKey,
} from "./events";

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
    events: Object.freeze([]),
    lastSequences: Object.freeze({}),
    terminalRunIds: Object.freeze([]),
  });

export const projectInteractionEvent = (event: InteractionEvent): InteractionUiEvent | null => {
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
      ...(event.event.facts.reasonCode
        ? { reasonCode: event.event.facts.reasonCode }
        : {}),
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
        ...(event.event.facts.reasonCode
          ? { reasonCode: event.event.facts.reasonCode }
          : {}),
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
): InteractionProjection => {
  if (event.conversationId !== state.conversationId) {
    throw new TypeError("Interaction events cannot cross conversation boundaries.");
  }
  const eventId = interactionEventId(event);
  if (state.eventIds.includes(eventId)) {
    return state;
  }
  const runId = interactionRunId(event);
  if (state.terminalRunIds.includes(runId)) {
    throw new TypeError("Interaction events cannot follow a terminal run event.");
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
    events: projected ? Object.freeze([...state.events, projected]) : state.events,
    lastSequences: Object.freeze({
      ...state.lastSequences,
      [sequenceKey]: event.event.sequence,
    }),
    terminalRunIds:
      terminalStatus(event) === null
        ? state.terminalRunIds
        : Object.freeze([...state.terminalRunIds, runId]),
  });
};
