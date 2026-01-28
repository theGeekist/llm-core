import { describe, expect, it } from "bun:test";
import type {
  EventStream,
  EventStreamEvent,
  Model,
  ModelCall,
  ModelResult,
  SkillLoader,
  SkillSnapshotEntry,
  ToolCall,
  ToolResult,
} from "../../src/adapters/types";
import { createBuiltinModel, createBuiltinTools } from "../../src/adapters";
import { createAgentRuntime } from "../../src/interaction";
import { bindFirst } from "../../src/shared/fp";
import type { InteractionState } from "../../src/interaction/types";
import type { TraceEvent } from "../../src/shared/reporting";
import type { Outcome } from "../../src/workflow/types";

type RecordingStream = {
  events: EventStreamEvent[];
  stream: EventStream;
};

const recordEvent = (events: EventStreamEvent[], event: EventStreamEvent) => {
  events.push(event);
  return true;
};

const createRecordingEventStream = (): RecordingStream => {
  const events: EventStreamEvent[] = [];
  return {
    events,
    stream: { emit: bindFirst(recordEvent, events) },
  };
};

const createStreamingModel = (): Model => ({
  generate: () => ({ text: "fallback" }),
  stream: () => [
    { type: "delta", text: "stream" },
    { type: "end", text: "done" },
  ],
});

const readEventName = (event: EventStreamEvent) => event.name;

type ToolCallModelState = {
  toolCalls: ToolCall[];
};

const hasTools = (call: ModelCall) => Array.isArray(call.tools) && call.tools.length > 0;

const runToolCallModel = (state: ToolCallModelState, call: ModelCall): ModelResult => {
  if (hasTools(call)) {
    return { toolCalls: state.toolCalls };
  }
  return { text: "plan" };
};

const createToolCallModel = (toolCalls: ToolCall[]): Model => ({
  generate: bindFirst(runToolCallModel, { toolCalls }),
});

const loadSkills = (input: { skills: SkillSnapshotEntry[] }) => ({ skills: input.skills });

const createSkillLoader = (skills: SkillSnapshotEntry[]): SkillLoader => ({
  load: bindFirst(loadSkills, { skills }),
});

const createStateFromTrace = (trace: TraceEvent[]): InteractionState => ({
  messages: [],
  diagnostics: [],
  trace,
});

const readAgentToolResults = (result: Outcome<unknown>): ToolResult[] => {
  if (result.status === "error") {
    return [];
  }
  const agent = result.artefact as { agent?: { toolResults?: ToolResult[] } };
  return agent.agent?.toolResults ?? [];
};

const readSnapshotFromTrace = (
  trace: TraceEvent[],
): {
  toolAllowlist?: string[] | null;
  selectedAgentId?: string;
  skills?: SkillSnapshotEntry[];
} | null => {
  for (const entry of trace) {
    if (entry.kind === "agent.loop.snapshot") {
      const data = entry.data as { snapshot?: unknown } | undefined;
      return (
        (data?.snapshot as {
          toolAllowlist?: string[] | null;
          selectedAgentId?: string;
          skills?: SkillSnapshotEntry[];
        }) ?? null
      );
    }
  }
  return null;
};

const readInteractionItemEvents = (events: EventStreamEvent[]) =>
  events.filter((event) => event.name === "interaction.item");

const readInteractionSubagentEvents = (events: EventStreamEvent[]) =>
  events.filter((event) => event.name === "interaction.subagent");

const readSubagentEventTypes = (events: EventStreamEvent[]) =>
  events
    .filter((event) => event.name === "interaction.subagent")
    .map(
      (event) => (event.data as { event?: { event?: { type?: string } } }).event?.event?.type ?? "",
    );

describe("createAgentRuntime", () => {
  it("runs the agent recipe", async () => {
    const runtime = createAgentRuntime({
      model: createBuiltinModel(),
      adapters: { tools: createBuiltinTools() },
    });

    const result = await runtime.run({ text: "hello" });

    expect(result.status).toBe("ok");
  });

  it("emits item events and records snapshots", async () => {
    const runtime = createAgentRuntime({
      model: createBuiltinModel(),
      adapters: { tools: createBuiltinTools() },
      config: {
        agents: [
          {
            id: "agent-1",
            name: "Primary",
            prompt: "Be helpful.",
          },
        ],
        agentSelection: { agentId: "agent-1" },
        tools: { allowlist: [" tools.search ", "tools.write", "tools.search"] },
      },
    });
    const recording = createRecordingEventStream();

    const result = await runtime.run({
      text: "hello",
      eventStream: recording.stream,
      interactionId: "interaction-1",
    });

    expect(result.status).toBe("ok");
    expect(readInteractionItemEvents(recording.events).length).toBeGreaterThan(0);
    expect(readInteractionSubagentEvents(recording.events).length).toBeGreaterThan(0);
    const snapshot = readSnapshotFromTrace(result.trace);
    expect(snapshot?.selectedAgentId).toBe("agent-1");
    expect(snapshot?.toolAllowlist).toEqual(["tools.search", "tools.write"]);
  });

  it("records skills in the agent snapshot", async () => {
    const skills: SkillSnapshotEntry[] = [
      { id: "skill-1", scope: "repo", path: "/repo/skills/skill-1/SKILL.md", hash: "hash-1" },
    ];
    const runtime = createAgentRuntime({
      model: createBuiltinModel(),
      adapters: { tools: createBuiltinTools(), skills: createSkillLoader(skills) },
      config: { skills: { directories: ["./skills"] } },
    });

    const result = await runtime.run({ text: "hello" });

    expect(result.status).toBe("ok");
    const snapshot = readSnapshotFromTrace(result.trace);
    expect(snapshot?.skills).toEqual(skills);
  });

  it("emits resume diagnostics when skills change between runs", async () => {
    const firstSkills: SkillSnapshotEntry[] = [
      { id: "skill-1", scope: "repo", path: "/repo/skills/skill-1/SKILL.md", hash: "hash-1" },
    ];
    const nextSkills: SkillSnapshotEntry[] = [
      { id: "skill-1", scope: "repo", path: "/repo/skills/skill-1/SKILL.md", hash: "hash-2" },
    ];
    const runtime = createAgentRuntime({
      model: createBuiltinModel(),
      adapters: { tools: createBuiltinTools(), skills: createSkillLoader(firstSkills) },
      config: { skills: { directories: ["./skills"] } },
    });

    const firstRun = await runtime.run({ text: "hello" });
    expect(firstRun.status).toBe("ok");

    const nextRuntime = createAgentRuntime({
      model: createBuiltinModel(),
      adapters: { tools: createBuiltinTools(), skills: createSkillLoader(nextSkills) },
      config: { skills: { directories: ["./skills"] } },
    });

    const nextRun = await nextRuntime.run({
      text: "hello",
      state: createStateFromTrace(firstRun.trace),
    });

    expect(nextRun.status).toBe("ok");
    const diagnostic = nextRun.diagnostics.find((entry) => entry.kind === "resume");
    expect(diagnostic?.message).toBe("Skill snapshot mismatch on resume.");
  });

  it("reports a diagnostic when agent selection is missing", async () => {
    const runtime = createAgentRuntime({
      model: createBuiltinModel(),
      adapters: { tools: createBuiltinTools() },
      config: {
        agents: [
          {
            id: "agent-1",
            name: "Primary",
            prompt: "Be helpful.",
          },
        ],
        agentSelection: { agentId: "agent-2" },
      },
    });

    const result = await runtime.run({ text: "hello" });

    expect(result.diagnostics.some((entry) => entry.message.includes("agent id"))).toBe(true);
  });

  it("runs subagent tools and emits lifecycle events", async () => {
    const runtime = createAgentRuntime({
      model: createToolCallModel([
        {
          id: "spawn-1",
          name: "agent.spawn",
          arguments: { agentId: "sub-1" },
        },
        {
          id: "send-1",
          name: "agent.send",
          arguments: { agentId: "sub-1", text: "ping" },
        },
        {
          id: "close-1",
          name: "agent.close",
          arguments: { agentId: "sub-1" },
        },
      ]),
      adapters: { tools: createBuiltinTools() },
    });
    const recording = createRecordingEventStream();

    const result = await runtime.run({
      text: "hello",
      eventStream: recording.stream,
      interactionId: "interaction-1",
    });

    expect(result.status).toBe("ok");
    const types = readSubagentEventTypes(recording.events);
    expect(types).toContain("started");
    expect(types).toContain("completed");
  });

  it("rejects subagent spawns beyond the limit", async () => {
    const runtime = createAgentRuntime({
      model: createToolCallModel([
        {
          id: "spawn-1",
          name: "agent.spawn",
          arguments: { agentId: "sub-1" },
        },
        {
          id: "spawn-2",
          name: "agent.spawn",
          arguments: { agentId: "sub-2" },
        },
      ]),
      adapters: { tools: createBuiltinTools() },
      subagents: { maxActive: 1 },
    });

    const result = await runtime.run({ text: "hello" });

    expect(result.status).toBe("ok");
    const toolResults = readAgentToolResults(result);
    expect(
      toolResults.some(
        (entry) =>
          typeof entry.result === "object" &&
          entry.result !== null &&
          "error" in entry.result &&
          entry.result.error === "subagent_limit_reached",
      ),
    ).toBe(true);
  });

  it("emits interaction model events when streaming", async () => {
    const runtime = createAgentRuntime({
      model: createStreamingModel(),
      adapters: { tools: createBuiltinTools() },
    });
    const recording = createRecordingEventStream();

    const result = await runtime.stream({
      text: "hello",
      eventStream: recording.stream,
      interactionId: "interaction-1",
    });

    expect(result.status).toBe("ok");
    expect(recording.events.length).toBeGreaterThan(0);
    expect(recording.events.map(readEventName)).toContain("interaction.model");
  });
});
