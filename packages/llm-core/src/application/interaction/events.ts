import { isJsonValue, type ConversationId, type EventId, type RunId } from "#contracts";
import type { AgentEvent } from "../../features/agent/public";
import type { ToolExecutionEvent } from "../../features/evidence/public";
import type {
  InteractionContentEvent,
  InteractionEvent,
  RegisteredInteractionContentEvent,
} from "./types";
import { isRegisteredInteractionContentEvent } from "./content-registration";

const freezePortable = <T>(value: T): T => {
  const cloned = structuredClone(value);
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object" || Object.isFrozen(node)) {
      return;
    }
    Object.freeze(node);
    for (const child of Object.values(node)) {
      visit(child);
    }
  };
  visit(cloned);
  return cloned;
};

const agentFacts = (event: AgentEvent): AgentEvent["facts"] => {
  switch (event.kind) {
    case "agent.run.started":
      return {
        agentId: event.facts.agentId,
        agentVersion: event.facts.agentVersion,
      };
    case "agent.run.progress":
      return { code: event.facts.code };
    case "agent.run.intervention.requested":
      return {
        interventionId: event.facts.interventionId,
        checkpointId: event.facts.checkpointId,
        checkpointRevision: event.facts.checkpointRevision,
        runId: event.facts.runId,
        stepId: event.facts.stepId,
        actionDigest: event.facts.actionDigest,
        requestedAt: event.facts.requestedAt,
        expiresAt: event.facts.expiresAt,
        allowed: [...event.facts.allowed],
      };
    case "agent.run.intervention.received":
      return {
        decision: event.facts.decision,
        interventionId: event.facts.interventionId,
      };
    case "agent.run.cancellation.requested":
      return {
        requestedAt: event.facts.requestedAt,
        reasonProvided: event.facts.reasonProvided,
      };
    case "agent.run.cancellation.acknowledged":
      return { acknowledgedAt: event.facts.acknowledgedAt };
    case "agent.run.input.accepted":
      return {
        messageId: event.facts.messageId,
        correlationId: event.facts.correlationId,
        acceptedAt: event.facts.acceptedAt,
        deliveryMode: event.facts.deliveryMode,
      };
    case "agent.run.input.recipient-observed":
      return {
        messageId: event.facts.messageId,
        correlationId: event.facts.correlationId,
        observedAt: event.facts.observedAt,
        evidenceRef: event.facts.evidenceRef,
      };
    case "agent.run.input.processing-observed":
      return {
        messageId: event.facts.messageId,
        correlationId: event.facts.correlationId,
        observedAt: event.facts.observedAt,
        causationRef: event.facts.causationRef,
      };
    case "agent.run.input.evidence-unavailable":
      return {
        messageId: event.facts.messageId,
        correlationId: event.facts.correlationId,
        stage: event.facts.stage,
        declaredAt: event.facts.declaredAt,
        reasonCode: event.facts.reasonCode,
      };
    case "agent.run.completed":
    case "agent.run.failed":
    case "agent.run.denied":
    case "agent.run.cancelled":
      return {
        status: event.facts.status,
        ...(event.facts.reasonCode ? { reasonCode: event.facts.reasonCode } : {}),
      };
    default:
      throw new TypeError("Unknown agent event kind.");
  }
};

export const interactionAgentEvent = (
  conversationId: ConversationId,
  source: AgentEvent,
): InteractionEvent => {
  const event = {
    eventId: source.eventId,
    kind: source.kind,
    occurredAt: source.occurredAt,
    sequence: source.sequence,
    identity: {
      runId: source.identity.runId,
      ...(source.identity.parentRunId ? { parentRunId: source.identity.parentRunId } : {}),
      ...(source.identity.causalRunId ? { causalRunId: source.identity.causalRunId } : {}),
    },
    facts: agentFacts(source),
  } as AgentEvent;
  return freezePortable({ kind: "agent-run", conversationId, event });
};

export const interactionExecutionEvent = (
  conversationId: ConversationId,
  source: ToolExecutionEvent,
): InteractionEvent => {
  const event: ToolExecutionEvent = {
    eventId: source.eventId,
    kind: source.kind,
    occurredAt: source.occurredAt,
    sequence: source.sequence,
    runId: source.runId,
    ...(source.stepId ? { stepId: source.stepId } : {}),
    toolCallId: source.toolCallId,
    ...(source.causalParentId ? { causalParentId: source.causalParentId } : {}),
    facts: {
      receiptId: source.facts.receiptId,
      receiptRevision: source.facts.receiptRevision,
      receiptState: source.facts.receiptState,
      effectDisposition: source.facts.effectDisposition,
      actionDigest: {
        algorithm: source.facts.actionDigest.algorithm,
        keyRef: source.facts.actionDigest.keyRef,
        value: source.facts.actionDigest.value,
      },
      ...(source.facts.policy ? { policy: { ...source.facts.policy } } : {}),
      ...(source.facts.approval ? { approval: { ...source.facts.approval } } : {}),
      ...(source.facts.cancellation ? { cancellation: { ...source.facts.cancellation } } : {}),
      ...(source.facts.approvalExpiresAt
        ? { approvalExpiresAt: source.facts.approvalExpiresAt }
        : {}),
      ...(source.facts.approvalRequiredApprover
        ? { approvalRequiredApprover: { ...source.facts.approvalRequiredApprover } }
        : {}),
      ...(source.facts.reasonCode ? { reasonCode: source.facts.reasonCode } : {}),
    },
    redaction:
      source.redaction.kind === "not-required"
        ? { kind: "not-required" }
        : {
            kind: source.redaction.kind,
            categories: [...source.redaction.categories],
          },
    ...(source.authorizedEvidence ? { authorizedEvidence: { ...source.authorizedEvidence } } : {}),
    ...(source.extensions ? { extensions: { ...source.extensions } } : {}),
  };
  return freezePortable({ kind: "tool-execution", conversationId, event });
};

const contentFacts = (event: InteractionContentEvent): InteractionContentEvent["facts"] => {
  switch (event.kind) {
    case "interaction.message.started":
    case "interaction.message.completed":
      return { messageId: event.facts.messageId };
    case "interaction.message.text.delta":
    case "interaction.message.reasoning.delta":
      return { messageId: event.facts.messageId, text: event.facts.text };
    case "interaction.message.tool.call":
      if (!isJsonValue(event.facts.projectedInput)) {
        throw new TypeError("Projected tool input must be strict redacted JSON.");
      }
      return {
        messageId: event.facts.messageId,
        toolCallId: event.facts.toolCallId,
        toolName: event.facts.toolName,
        projectedInput: event.facts.projectedInput,
      };
    case "interaction.message.tool.result":
      if (!isJsonValue(event.facts.projectedResult)) {
        throw new TypeError("Projected tool result must be strict redacted JSON.");
      }
      return {
        messageId: event.facts.messageId,
        toolCallId: event.facts.toolCallId,
        toolName: event.facts.toolName,
        projectedResult: event.facts.projectedResult,
        isError: event.facts.isError,
      };
    case "interaction.message.failed":
      return {
        messageId: event.facts.messageId,
        reasonCode: event.facts.reasonCode,
      };
    default:
      throw new TypeError("Unknown interaction content event kind.");
  }
};

export const interactionContentEvent = (
  conversationId: ConversationId,
  source: RegisteredInteractionContentEvent,
): InteractionEvent => {
  if (!isRegisteredInteractionContentEvent(source)) {
    throw new TypeError("Interaction content must cross the registered redaction boundary.");
  }
  const event = {
    eventId: source.eventId,
    kind: source.kind,
    occurredAt: source.occurredAt,
    sequence: source.sequence,
    runId: source.runId,
    facts: contentFacts(source),
    redaction:
      source.redaction.kind === "not-required"
        ? { kind: "not-required" }
        : {
            kind: source.redaction.kind,
            categories: [...source.redaction.categories],
          },
  } as InteractionContentEvent;
  return freezePortable({ kind: "content", conversationId, event });
};

export const interactionEventId = (event: InteractionEvent): EventId => event.event.eventId;

export const interactionRunId = (event: InteractionEvent): RunId =>
  event.kind === "agent-run" ? event.event.identity.runId : event.event.runId;

export const interactionSequenceKey = (event: InteractionEvent): string => {
  const runId = interactionRunId(event);
  if (event.kind === "tool-execution") {
    return `tool:${runId}:${event.event.toolCallId}`;
  }
  if (event.kind === "content") {
    return `content:${runId}:${event.event.facts.messageId}`;
  }
  return `agent:${runId}`;
};
