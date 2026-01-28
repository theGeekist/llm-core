import { describe, expect, it } from "bun:test";
import type { EventStreamEvent } from "../../src/adapters/types";
import {
  appendAgentLoopSnapshot,
  createAgentEventState,
  emitAgentLoopEvents,
  validateAgentSelection,
} from "../../src/interaction/agent-runtime-events";
import type {
  AgentLoopConfig,
  AgentLoopStateSnapshot,
  InteractionEvent,
} from "../../src/interaction/types";
import type { AgentState } from "../../src/recipes/agentic/shared";
import { createTraceDiagnostics } from "../../src/shared/reporting";
import type { Outcome } from "../../src/workflow/types";

type RecordedStream = {
  events: EventStreamEvent[];
  emit: (event: EventStreamEvent) => boolean;
};

const recordEvent = (events: EventStreamEvent[], event: EventStreamEvent) => {
  events.push(event);
  return true;
};

const createStream = (): RecordedStream => {
  const events: EventStreamEvent[] = [];
  return { events, emit: (event) => recordEvent(events, event) };
};

const createOutcomeOk = (artefact: unknown): Outcome<unknown> => ({
  status: "ok",
  artefact,
  ...createTraceDiagnostics(),
});

const createOutcomeError = (): Outcome<unknown> => ({
  status: "error",
  error: new Error("boom"),
  ...createTraceDiagnostics(),
});

const readEvents = (stream: RecordedStream): InteractionEvent[] =>
  stream.events.map((event) => (event.data as { event: InteractionEvent }).event);

describe("agent runtime events", () => {
  it("normalizes sequence starts", () => {
    const negative = createAgentEventState({
      interactionId: "interaction",
      correlationId: "corr",
      startSequence: -10,
    });
    const floaty = createAgentEventState({
      interactionId: "interaction",
      correlationId: "corr",
      startSequence: 2.9,
    });
    const invalid = createAgentEventState({
      interactionId: "interaction",
      correlationId: "corr",
      startSequence: Number.NaN,
    });

    expect(negative.nextSequence()).toBe(1);
    expect(floaty.nextSequence()).toBe(3);
    expect(invalid.nextSequence()).toBe(1);
  });

  it("appends snapshots with normalized allowlists and cache keys", () => {
    const outcome = createOutcomeOk({});
    const config: AgentLoopConfig = {
      agents: [{ id: "agent-1", name: "Agent", description: "a", prompt: "p" }],
      tools: { allowlist: [" tool-a", "tool-a", ""] },
      agentSelection: { agentId: "agent-1" },
    };

    appendAgentLoopSnapshot({
      config,
      skills: [{ id: "skill-1", scope: "repo", path: "/repo/skill-1", hash: "h1" }],
      approvalCacheKeys: ["approval-1"],
      outcome,
    });

    const trace = outcome.trace[0];
    const snapshot = (trace?.data as { snapshot?: AgentLoopStateSnapshot })?.snapshot;
    expect(trace?.kind).toBe("agent.loop.snapshot");
    expect(snapshot?.toolAllowlist).toEqual(["tool-a"]);
  });

  it("omits empty allowlists and infers single agent selection", () => {
    const outcome = createOutcomeOk({});
    const config: AgentLoopConfig = {
      agents: [{ id: "agent-1", name: "Agent", description: "a", prompt: "p" }],
      tools: { allowlist: [" ", ""] },
    };

    appendAgentLoopSnapshot({ config, outcome });
    const trace = outcome.trace[0];
    const snapshot = (trace?.data as { snapshot?: AgentLoopStateSnapshot })?.snapshot;

    expect(snapshot?.toolAllowlist).toBeUndefined();
    expect(snapshot?.selectedAgentId).toBe("agent-1");
  });

  it("flags missing agent selections", () => {
    const outcome = createOutcomeOk({});
    const config: AgentLoopConfig = {
      agents: [],
      agentSelection: { agentId: "missing" },
    };

    validateAgentSelection({ config, outcome });
    expect(outcome.diagnostics.length).toBe(1);
  });

  it("emits selected agent and item events", () => {
    const stream = createStream();
    const state = createAgentEventState({
      interactionId: "interaction",
      correlationId: "corr",
    });
    const config: AgentLoopConfig = {
      agents: [{ id: "agent-1", name: "Agent", description: "a", prompt: "p", tools: ["tool"] }],
    };
    const artefact: { agent: AgentState } = {
      agent: { plan: "step", response: "done" },
    };
    const outcome = createOutcomeOk(artefact);

    emitAgentLoopEvents({
      outcome,
      config,
      eventStream: { emit: stream.emit },
      eventState: state,
    });

    const events = readEvents(stream);
    expect(events.length).toBe(3);
    expect(events[0]?.kind).toBe("subagent");
    expect(events[1]?.kind).toBe("item");
    expect(events[2]?.kind).toBe("item");
  });

  it("skips emission when no stream, state, or events exist", () => {
    const outcome = createOutcomeOk("invalid");
    const config: AgentLoopConfig = {
      agents: [{ id: "agent-1", name: "Agent", description: "a", prompt: "p" }],
      agentSelection: { agentId: "missing" },
    };
    const noStream = emitAgentLoopEvents({ outcome, config });
    expect(noStream).toBeNull();

    const stream = createStream();
    const noState = emitAgentLoopEvents({ outcome, config, eventStream: { emit: stream.emit } });
    expect(noState).toBeNull();

    const state = createAgentEventState({
      interactionId: "interaction",
      correlationId: "corr",
    });
    const noEvents = emitAgentLoopEvents({
      outcome: createOutcomeError(),
      config,
      eventStream: { emit: stream.emit },
      eventState: state,
    });
    expect(noEvents).toBeNull();
  });

  it("returns null when the outcome has no agent state", () => {
    const stream = createStream();
    const state = createAgentEventState({
      interactionId: "interaction",
      correlationId: "corr",
    });
    const config: AgentLoopConfig = {
      agents: [],
      agentSelection: { agentId: "agent-1" },
    };
    const outcome = createOutcomeOk({ agent: "not-an-object" });

    const result = emitAgentLoopEvents({
      outcome,
      config,
      eventStream: { emit: stream.emit },
      eventState: state,
    });

    expect(result).toBeNull();
  });
});
