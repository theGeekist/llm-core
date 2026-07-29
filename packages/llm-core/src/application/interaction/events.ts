import type { ConversationId, EventId, RunId } from "#contracts";
import type { AgentRunEvent } from "../../features/agent/public";
import type { ExecutionEvent } from "../../features/evidence/public";
import type { InteractionEvent } from "./types";

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

const agentFacts = (event: AgentRunEvent): AgentRunEvent["facts"] => {
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
  source: AgentRunEvent,
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
  } as AgentRunEvent;
  return freezePortable({ kind: "agent-run", conversationId, event });
};

export const interactionExecutionEvent = (
  conversationId: ConversationId,
  source: ExecutionEvent,
): InteractionEvent => {
  const event: ExecutionEvent = {
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
      ...(source.facts.cancellation
        ? { cancellation: { ...source.facts.cancellation } }
        : {}),
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
    ...(source.authorizedEvidence
      ? { authorizedEvidence: { ...source.authorizedEvidence } }
      : {}),
    ...(source.extensions ? { extensions: { ...source.extensions } } : {}),
  };
  return freezePortable({ kind: "tool-execution", conversationId, event });
};

export const interactionEventId = (event: InteractionEvent): EventId => event.event.eventId;

export const interactionRunId = (event: InteractionEvent): RunId =>
  event.kind === "agent-run" ? event.event.identity.runId : event.event.runId;
