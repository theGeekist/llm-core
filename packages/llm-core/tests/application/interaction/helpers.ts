import {
  contractVersion,
  coreId,
  externalId,
  newCoreId,
  type ConversationId,
  type EventId,
  type InvocationId,
  type ProviderSessionId,
  type RunId,
} from "#contracts";
import type {
  AgentRun,
  AgentRunEvent,
  AgentRunRequest,
  PreparedAgentSpec,
  RunResult,
} from "../../../src/features/agent/public";
import type { InteractionContentEvent } from "../../../src/application/interaction/public";
import { prepareAgentSpec } from "../../../src/features/agent/public";

export const CONVERSATION_ID = newCoreId<ConversationId>(
  "018f0f4e-8c5b-7a91-8c3b-123456789d01",
);
export const OTHER_CONVERSATION_ID = newCoreId<ConversationId>(
  "018f0f4e-8c5b-7a91-8c3b-123456789d02",
);
export const RUN_ID = newCoreId<RunId>("018f0f4e-8c5b-7a91-8c3b-123456789d03");
export const SECOND_RUN_ID = newCoreId<RunId>(
  "018f0f4e-8c5b-7a91-8c3b-123456789d05",
);
export const INVOCATION_ID = newCoreId<InvocationId>(
  "018f0f4e-8c5b-7a91-8c3b-123456789d04",
);
export const PROVIDER_SESSION_ID = externalId<ProviderSessionId>("provider-session-1");
export const NOW = "2026-07-29T15:00:00.000Z";

export const AGENT: PreparedAgentSpec = prepareAgentSpec({
  agentId: "interaction-test-agent",
  version: contractVersion("2.0.0"),
  instructions: "Test interaction orchestration.",
  effectRequirement: "read-only",
});

export const eventId = (suffix: string): EventId =>
  coreId<EventId>(`018f0f4e-8c5b-7a91-8c3b-123456789${suffix}`);

export const agentEvent = (
  kind: AgentRunEvent["kind"],
  sequence: number,
  facts: AgentRunEvent["facts"],
): AgentRunEvent =>
  ({
    eventId: eventId(`e${String(sequence).padStart(2, "0")}`),
    kind,
    occurredAt: NOW,
    sequence,
    identity: { runId: RUN_ID },
    facts,
  }) as AgentRunEvent;

export const contentEvent = (
  kind: InteractionContentEvent["kind"],
  sequence: number,
  facts: InteractionContentEvent["facts"],
): InteractionContentEvent =>
  ({
    eventId: eventId(`f${String(sequence).padStart(2, "0")}`),
    kind,
    occurredAt: NOW,
    sequence,
    runId: RUN_ID,
    facts,
    redaction: { kind: "redacted", categories: ["personal-data"] },
  }) as InteractionContentEvent;

export const completedRun = (
  request: AgentRunRequest,
  events?: readonly AgentRunEvent[],
  runId: RunId = RUN_ID,
): AgentRun => {
  const sourceEvents = (
    events ?? [
      agentEvent("agent.run.started", 0, {
        agentId: AGENT.agentId,
        agentVersion: AGENT.version,
      }),
      agentEvent("agent.run.progress", 1, { code: "writing" }),
      agentEvent("agent.run.completed", 2, { status: "completed" }),
    ]
  ).map((event) => ({ ...event, identity: { ...event.identity, runId } })) as AgentRunEvent[];
  const resultDraft: RunResult = {
    identity: { runId },
    status: "completed",
    output: { text: "done" },
    providerSession: {
      kind: "provider-session-ref",
      providerId: "provider",
      sessionId: PROVIDER_SESSION_ID,
    },
  };
  const result: RunResult = Object.freeze(resultDraft);
  return Object.freeze({
    identity: result.identity,
    async *events() {
      for (const event of sourceEvents) {
        yield event;
      }
    },
    result: () => result,
    cancel: () => ({ status: "already-terminal", acknowledgedAt: NOW }),
    intervene: () => ({ status: "already-terminal", acknowledgedAt: NOW }),
    request,
  }) as AgentRun;
};
