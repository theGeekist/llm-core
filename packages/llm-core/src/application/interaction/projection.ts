import type { ConversationId, RunId } from "#contracts";
import type { AgentEvent, AgentResult } from "../../features/agent/public";
import type {
  InteractionEvent,
  InteractionProjection,
  InteractionRunStatus,
  ConversationEvent,
} from "./types";
import {
  interactionAgentEvent,
  interactionEventId,
  interactionRunId,
  interactionSequenceKey,
} from "./events";
import { isSafeInteractionCode } from "./content-registration";

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

const requireNewEvent = (
  state: InteractionProjection,
  eventId: string,
  fingerprint: string,
): boolean => {
  const priorFingerprint = state.eventFingerprints[eventId];
  if (priorFingerprint === undefined) {
    return true;
  }
  if (priorFingerprint === fingerprint) {
    return false;
  }
  throw new TypeError("Interaction event IDs cannot identify conflicting facts.");
};

const requireOpenRun = (
  state: InteractionProjection,
  event: InteractionEvent,
  runId: RunId,
): void => {
  if (state.terminalRunIds.includes(runId)) {
    throw new TypeError("Interaction events cannot follow a terminal run event.");
  }
  const hasOpenMessage = state.startedMessageKeys.some(
    (key) => key.startsWith(`${runId}:`) && !state.terminalMessageKeys.includes(key),
  );
  if (terminalStatus(event) !== null && hasOpenMessage) {
    throw new TypeError("Interaction runs cannot terminate while a content message remains open.");
  }
};

const messageTransition = (
  state: InteractionProjection,
  event: InteractionEvent,
  runId: RunId,
): { readonly key: string | null; readonly starts: boolean } => {
  if (event.kind !== "content") {
    return { key: null, starts: false };
  }
  const key = `${runId}:${event.event.facts.messageId}`;
  const starts = event.event.kind === "interaction.message.started";
  if (state.terminalMessageKeys.includes(key)) {
    throw new TypeError("Interaction content cannot follow a terminal message event.");
  }
  if (starts && state.startedMessageKeys.includes(key)) {
    throw new TypeError("Interaction messages can start exactly once.");
  }
  if (!starts && !state.startedMessageKeys.includes(key)) {
    throw new TypeError("Interaction message content requires a preceding start event.");
  }
  return { key, starts };
};

const toolCallTransition = (
  state: InteractionProjection,
  event: InteractionEvent,
  runId: RunId,
): string | null => {
  if (
    event.kind !== "content" ||
    (event.event.kind !== "interaction.message.tool.call" &&
      event.event.kind !== "interaction.message.tool.result")
  ) {
    return null;
  }
  const key = `${runId}:${event.event.facts.toolCallId}`;
  const seen = state.seenToolCallKeys.includes(key);
  if (event.event.kind === "interaction.message.tool.call" && seen) {
    throw new TypeError("Interaction tool calls can be projected exactly once.");
  }
  if (event.event.kind === "interaction.message.tool.result" && !seen) {
    throw new TypeError("Interaction tool results require a preceding tool call.");
  }
  return key;
};

const requireIncreasingSequence = (
  state: InteractionProjection,
  event: InteractionEvent,
): string => {
  const key = interactionSequenceKey(event);
  const lastSequence = state.lastSequences[key];
  if (lastSequence !== undefined && event.event.sequence <= lastSequence) {
    throw new TypeError("Interaction event sequences must increase monotonically.");
  }
  return key;
};

const requireActiveInputContinuity = (
  state: InteractionProjection,
  projected: ConversationEvent | null,
): void => {
  if (projected?.kind === "active-input-accepted") {
    const duplicate = state.acceptedActiveInputs.some(
      (accepted) =>
        accepted.runId === projected.runId &&
        (accepted.messageId === projected.messageId ||
          accepted.correlationId === projected.correlationId),
    );
    if (duplicate) {
      throw new TypeError(
        "Active-input acceptance cannot reuse a message or correlation within one run.",
      );
    }
    return;
  }
  if (
    projected?.kind !== "active-input-recipient-observed" &&
    projected?.kind !== "active-input-processing-observed" &&
    projected?.kind !== "active-input-evidence-unavailable"
  ) {
    return;
  }
  const accepted = state.acceptedActiveInputs.some(
    (identity) =>
      identity.runId === projected.runId &&
      identity.messageId === projected.messageId &&
      identity.correlationId === projected.correlationId,
  );
  if (!accepted) {
    throw new TypeError(
      "Active-input evidence requires the exact prior accepted message and correlation.",
    );
  }
};

const nextStatus = (
  state: InteractionProjection,
  event: InteractionEvent,
): InteractionRunStatus => {
  const terminal = terminalStatus(event);
  if (terminal !== null || event.kind !== "agent-run") {
    return terminal ?? state.status;
  }
  switch (event.event.kind) {
    case "agent.run.started":
    case "agent.run.intervention.received":
      return "running";
    case "agent.run.intervention.requested":
      return "awaiting-intervention";
    case "agent.run.cancellation.requested":
      return "cancellation-requested";
    default:
      return state.status;
  }
};

export interface InteractionTerminalObservation {
  readonly status?: AgentResult["status"];
  readonly reasonCode?: string;
}

const terminalObservation = (event: AgentEvent): InteractionTerminalObservation | null => {
  switch (event.kind) {
    case "agent.run.completed":
    case "agent.run.failed":
    case "agent.run.denied":
    case "agent.run.cancelled":
      return {
        status: event.facts.status,
        ...(event.facts.reasonCode === undefined ? {} : { reasonCode: event.facts.reasonCode }),
      };
    default:
      return null;
  }
};

const recordTerminalObservation = (
  current: InteractionTerminalObservation,
  event: AgentEvent,
): InteractionTerminalObservation => {
  const terminal = terminalObservation(event);
  if (terminal === null) {
    return current;
  }
  if (current.status !== undefined) {
    throw new TypeError("Agent runs can emit exactly one terminal event.");
  }
  if (terminal.reasonCode !== undefined && !isSafeInteractionCode(terminal.reasonCode)) {
    throw new TypeError("Agent terminal events require a safe reason code.");
  }
  return terminal;
};

export const observeInteractionAgentEvents = async (input: {
  readonly conversationId: ConversationId;
  readonly runId: RunId;
  readonly events: AsyncIterable<AgentEvent>;
  readonly emit: (event: InteractionEvent) => void;
}): Promise<InteractionTerminalObservation> => {
  let terminal: InteractionTerminalObservation = {};
  for await (const source of input.events) {
    if (source.identity.runId !== input.runId) {
      throw new TypeError("Agent events must bind to the active run.");
    }
    terminal = recordTerminalObservation(terminal, source);
    input.emit(interactionAgentEvent(input.conversationId, source));
  }
  return terminal;
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
    acceptedActiveInputs: Object.freeze([]),
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
    case "agent.run.input.accepted":
      return Object.freeze({
        kind: "active-input-accepted",
        eventId,
        runId,
        messageId: event.event.facts.messageId,
        correlationId: event.event.facts.correlationId,
        acceptedAt: event.event.facts.acceptedAt,
        deliveryMode: event.event.facts.deliveryMode,
      });
    case "agent.run.input.recipient-observed":
      return Object.freeze({
        kind: "active-input-recipient-observed",
        eventId,
        runId,
        messageId: event.event.facts.messageId,
        correlationId: event.event.facts.correlationId,
        observedAt: event.event.facts.observedAt,
        evidenceRef: event.event.facts.evidenceRef,
      });
    case "agent.run.input.processing-observed":
      return Object.freeze({
        kind: "active-input-processing-observed",
        eventId,
        runId,
        messageId: event.event.facts.messageId,
        correlationId: event.event.facts.correlationId,
        observedAt: event.event.facts.observedAt,
        causationRef: event.event.facts.causationRef,
      });
    case "agent.run.input.evidence-unavailable":
      return Object.freeze({
        kind: "active-input-evidence-unavailable",
        eventId,
        runId,
        messageId: event.event.facts.messageId,
        correlationId: event.event.facts.correlationId,
        stage: event.event.facts.stage,
        declaredAt: event.event.facts.declaredAt,
        reasonCode: event.event.facts.reasonCode,
      });
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
): InteractionProjection => {
  if (event.conversationId !== state.conversationId) {
    throw new TypeError("Interaction events cannot cross conversation boundaries.");
  }
  const eventId = interactionEventId(event);
  const fingerprint = JSON.stringify(event);
  if (!requireNewEvent(state, eventId, fingerprint)) {
    return state;
  }
  const runId = interactionRunId(event);
  requireOpenRun(state, event, runId);
  const { key: messageKey, starts: startsMessage } = messageTransition(state, event, runId);
  const toolCallKey = toolCallTransition(state, event, runId);
  const sequenceKey = requireIncreasingSequence(state, event);
  const projected = projectInteractionEvent(event);
  requireActiveInputContinuity(state, projected);
  const terminal = terminalStatus(event);
  return Object.freeze({
    conversationId: state.conversationId,
    status: nextStatus(state, event),
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
      terminal === null ? state.terminalRunIds : Object.freeze([...state.terminalRunIds, runId]),
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
    acceptedActiveInputs:
      projected?.kind === "active-input-accepted"
        ? Object.freeze([
            ...state.acceptedActiveInputs,
            Object.freeze({
              runId: projected.runId,
              messageId: projected.messageId,
              correlationId: projected.correlationId,
            }),
          ])
        : state.acceptedActiveInputs,
  });
};
