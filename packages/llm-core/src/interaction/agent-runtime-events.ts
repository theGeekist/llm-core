import type { EventStream } from "#adapters/types";
import { bindFirst } from "#shared/fp";
import { isRecord } from "#shared/guards";
import type { MaybePromise } from "#shared/maybe";
import { addDiagnostic, addTrace } from "#shared/reporting";
import type { AgentState } from "#recipes/agentic/shared";
import type { Outcome } from "#workflow/types";
import { createRecipeDiagnostic } from "#shared/diagnostics";
import type {
  AgentDefinition,
  AgentLoopConfig,
  AgentLoopStateSnapshot,
  InteractionEvent,
  InteractionEventMeta,
  InteractionItemEvent,
  InteractionSubagentEvent,
} from "./types";
import { emitInteractionEvents } from "./transport";
import { resolveAgentExecutionProfile, type AgentExecutionProfile } from "./agent-profile";

export type AgentEventState = {
  interactionId: string;
  correlationId: string;
  nextSequence: () => number;
  nextSourceId: () => string;
};

type AgentSequenceState = { current: number };
type AgentSourceState = { current: number; prefix: string };

function incrementSequence(state: AgentSequenceState) {
  state.current += 1;
  return state.current;
}

function normalizeSequenceStart(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function createSequenceFrom(start?: number) {
  return bindFirst(incrementSequence, { current: normalizeSequenceStart(start) });
}

function incrementSourceId(state: AgentSourceState) {
  state.current += 1;
  return `${state.prefix}.model.${state.current}`;
}

function createSourceId(prefix: string) {
  return bindFirst(incrementSourceId, { current: 0, prefix });
}

export function createAgentEventState(input: {
  interactionId: string;
  correlationId: string;
  startSequence?: number;
}): AgentEventState {
  return {
    interactionId: input.interactionId,
    correlationId: input.correlationId,
    nextSequence: createSequenceFrom(input.startSequence),
    nextSourceId: createSourceId(input.interactionId),
  };
}

function readAgentExecutionProfile(
  profile: AgentExecutionProfile | undefined,
  config: AgentLoopConfig | undefined,
) {
  return profile ?? resolveAgentExecutionProfile(config);
}

function buildAgentLoopSnapshot(input: {
  config?: AgentLoopConfig;
  profile?: AgentExecutionProfile;
  skills?: AgentLoopStateSnapshot["skills"];
  toolAllowlist?: string[] | null;
}): AgentLoopStateSnapshot | null {
  if (!input.config && !input.skills) {
    return null;
  }
  const profile = readAgentExecutionProfile(input.profile, input.config);
  const selectedAgentId = profile.selectedAgent?.id;
  const toolAllowlist =
    input.toolAllowlist === undefined ? profile.toolAllowlist : input.toolAllowlist;
  const snapshot: AgentLoopStateSnapshot = {};
  if (selectedAgentId) {
    snapshot.selectedAgentId = selectedAgentId;
  }
  if (toolAllowlist) {
    snapshot.toolAllowlist = toolAllowlist;
  }
  if (input.skills) {
    snapshot.skills = input.skills;
  }
  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

export function appendAgentLoopSnapshot(input: {
  config?: AgentLoopConfig;
  profile?: AgentExecutionProfile;
  skills?: AgentLoopStateSnapshot["skills"];
  toolAllowlist?: string[] | null;
  outcome: Outcome<unknown>;
}) {
  const snapshot = buildAgentLoopSnapshot({
    config: input.config,
    profile: input.profile,
    skills: input.skills,
    toolAllowlist: input.toolAllowlist,
  });
  if (snapshot) {
    addTrace({ trace: input.outcome.trace }, "agent.loop.snapshot", { snapshot });
  }
  return input.outcome;
}

function hasAgentWithId(agents: AgentLoopConfig["agents"] | undefined, agentId: string) {
  if (!agents || agents.length === 0) {
    return false;
  }
  for (const agent of agents) {
    if (agent.id === agentId) {
      return true;
    }
  }
  return false;
}

export function validateAgentSelection(input: {
  config?: AgentLoopConfig;
  outcome: Outcome<unknown>;
}) {
  const agentId = input.config?.agentSelection?.agentId;
  if (!agentId) {
    const agents = input.config?.agents ?? [];
    if (agents.length > 1) {
      addDiagnostic(
        { diagnostics: input.outcome.diagnostics },
        createRecipeDiagnostic("Agent selection is ambiguous.", {
          agentIds: agents.map((agent) => agent.id).sort(),
        }),
      );
    }
    return input.outcome;
  }
  const hasAgent = hasAgentWithId(input.config?.agents, agentId);
  if (!hasAgent) {
    addDiagnostic(
      { diagnostics: input.outcome.diagnostics },
      createRecipeDiagnostic("Requested agent id is not available.", { agentId }),
    );
  }
  return input.outcome;
}

function readAgentStateFromArtefact(value: unknown): AgentState | null {
  if (!isRecord(value)) {
    return null;
  }
  const agent = value.agent;
  if (!isRecord(agent)) {
    return null;
  }
  return agent as AgentState;
}

function readAgentStateFromOutcome(outcome: Outcome<unknown>): AgentState | null {
  if (outcome.status !== "ok" && outcome.status !== "paused") {
    return null;
  }
  return readAgentStateFromArtefact(outcome.artefact);
}

function readAgentPlanText(agent: AgentState) {
  return typeof agent.plan === "string" ? agent.plan : null;
}

function readAgentResponseText(agent: AgentState) {
  return typeof agent.response === "string" ? agent.response : null;
}

function buildPlanItemEvent(text: string): InteractionItemEvent {
  return {
    type: "completed",
    item: {
      id: "plan",
      details: { type: "reasoning", text },
    },
  };
}

function buildResponseItemEvent(text: string): InteractionItemEvent {
  return {
    type: "completed",
    item: {
      id: "response",
      details: { type: "agent_message", text },
    },
  };
}

function buildAgentItemEvents(agent: AgentState): InteractionItemEvent[] {
  const events: InteractionItemEvent[] = [];
  const planText = readAgentPlanText(agent);
  if (planText) {
    events.push(buildPlanItemEvent(planText));
  }
  const responseText = readAgentResponseText(agent);
  if (responseText) {
    events.push(buildResponseItemEvent(responseText));
  }
  return events;
}

function createAgentEventMeta(state: AgentEventState, sourceId: string): InteractionEventMeta {
  return {
    sequence: state.nextSequence(),
    timestamp: Date.now(),
    sourceId,
    correlationId: state.correlationId,
    interactionId: state.interactionId,
  };
}

function buildItemSourceId(itemId: string) {
  return `agent.${itemId}`;
}

function buildInteractionItemEvent(input: {
  state: AgentEventState;
  event: InteractionItemEvent;
}): InteractionEvent {
  return {
    kind: "item",
    event: input.event,
    meta: createAgentEventMeta(input.state, buildItemSourceId(input.event.item.id)),
  };
}

function mapInteractionItemEvent(input: { state: AgentEventState; event: InteractionItemEvent }) {
  return buildInteractionItemEvent(input);
}

function buildInteractionItemEvents(input: {
  state: AgentEventState;
  events: InteractionItemEvent[];
}) {
  const mapped: InteractionEvent[] = [];
  for (const event of input.events) {
    mapped.push(mapInteractionItemEvent({ state: input.state, event }));
  }
  return mapped;
}

function buildSubagentSelectedEvent(agent: AgentDefinition): InteractionSubagentEvent {
  return {
    type: "selected",
    agent: {
      id: agent.id,
      name: agent.name,
      displayName: agent.name,
      description: agent.description,
      tools: agent.tools ?? null,
    },
  };
}

function buildSubagentSourceId(agentId: string) {
  return `agent.${agentId}`;
}

function buildInteractionSubagentEvent(input: {
  state: AgentEventState;
  event: InteractionSubagentEvent;
}): InteractionEvent {
  return {
    kind: "subagent",
    event: input.event,
    meta: createAgentEventMeta(input.state, buildSubagentSourceId(input.event.agent.id)),
  };
}

function buildAgentInteractionEvents(input: {
  outcome: Outcome<unknown>;
  config?: AgentLoopConfig;
  profile?: AgentExecutionProfile;
  eventState: AgentEventState;
}) {
  const events: InteractionEvent[] = [];
  const selected = readAgentExecutionProfile(input.profile, input.config).selectedAgent;
  if (selected) {
    events.push(
      buildInteractionSubagentEvent({
        state: input.eventState,
        event: buildSubagentSelectedEvent(selected),
      }),
    );
  }
  const agent = readAgentStateFromOutcome(input.outcome);
  if (agent) {
    const items = buildAgentItemEvents(agent);
    for (const event of buildInteractionItemEvents({ state: input.eventState, events: items })) {
      events.push(event);
    }
  }
  return events;
}

export function emitAgentLoopEvents(input: {
  outcome: Outcome<unknown>;
  config?: AgentLoopConfig;
  profile?: AgentExecutionProfile;
  eventStream?: EventStream;
  eventState?: AgentEventState;
}): MaybePromise<boolean | null> {
  if (!input.eventStream || !input.eventState) {
    return null;
  }
  const events = buildAgentInteractionEvents({
    outcome: input.outcome,
    config: input.config,
    profile: input.profile,
    eventState: input.eventState,
  });
  if (events.length === 0) {
    return null;
  }
  return emitInteractionEvents(input.eventStream, events);
}
