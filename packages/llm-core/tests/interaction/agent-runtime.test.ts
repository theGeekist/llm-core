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
import {
  filterAgentTools,
  resolveAgentExecutionProfile,
} from "../../src/interaction/agent-profile";
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

const createRecordingModel = (calls: ModelCall[]): Model => ({
  generate: (call) => {
    calls.push(call);
    return { text: "done" };
  },
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

  it("gives later tool groups precedence while preserving merged tools", async () => {
    const runtime = createAgentRuntime({
      model: createToolCallModel([{ id: "priority-1", name: "tools.priority", arguments: {} }]),
      adapters: {
        tools: [{ name: "tools.base" }, { name: "tools.priority", execute: () => "base" }],
      },
    });

    const result = await runtime.run(
      { text: "hello" },
      {
        adapters: {
          tools: [
            { name: "tools.override" },
            { name: "tools.priority", execute: () => "override" },
          ],
        },
      },
    );

    expect(readAgentToolResults(result)[0]?.result).toBe("override");
  });

  it("uses model generation when no event stream is attached", async () => {
    let generateCalls = 0;
    let streamCalls = 0;
    const runtime = createAgentRuntime({
      model: {
        generate: () => {
          generateCalls += 1;
          return { text: "generated" };
        },
        stream: () => {
          streamCalls += 1;
          return [{ type: "end", text: "streamed" }];
        },
      },
    });

    const result = await runtime.run({ text: "hello" });

    expect(result.status).toBe("ok");
    expect(generateCalls).toBeGreaterThan(0);
    expect(streamCalls).toBe(0);
  });

  it("emits item events and records snapshots", async () => {
    const runtime = createAgentRuntime({
      model: createBuiltinModel(),
      adapters: {
        tools: createBuiltinTools([{ name: "tools.search" }, { name: "tools.write" }]),
      },
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
    expect(readSnapshotFromTrace(result.trace)?.selectedAgentId).toBeUndefined();
  });

  it("applies the selected prompt and effective tool policy", async () => {
    const calls: ModelCall[] = [];
    const executed: string[] = [];
    const tools = ["tools.write", "tools.search", "tools.delete"].map((name) => ({
      name,
      execute: () => {
        executed.push(name);
        return name;
      },
    }));
    const runtime = createAgentRuntime({
      model: createRecordingModel(calls),
      adapters: { tools },
      config: {
        agents: [
          {
            id: "agent-1",
            name: "Primary",
            prompt: "Be precise.",
            tools: ["tools.search", "tools.write"],
          },
        ],
        tools: {
          allowlist: ["tools.write", "tools.search", "tools.delete"],
          denylist: ["tools.write"],
        },
      },
    });

    await runtime.run({ text: "hello", context: "Use the repository." });

    expect(calls[0]?.system).toBe("Be precise.\n\nUse the repository.");
    expect(
      filterAgentTools(
        resolveAgentExecutionProfile({
          agents: [
            {
              id: "agent-1",
              name: "Primary",
              prompt: "Be precise.",
              tools: ["tools.search", "tools.write"],
            },
          ],
          tools: {
            allowlist: ["tools.write", "tools.search", "tools.delete"],
            denylist: ["tools.write"],
          },
        }),
        tools,
      )?.map((tool) => tool.name),
    ).toEqual(["tools.search"]);
    expect(executed).toEqual([]);
  });

  it("reports configured tools that are unavailable", async () => {
    const runtime = createAgentRuntime({
      model: createBuiltinModel(),
      adapters: { tools: [{ name: "tools.search" }] },
      config: { tools: { allowlist: ["tools.search", "tools.missing"] } },
    });

    const result = await runtime.run({ text: "hello" });
    const diagnostic = result.diagnostics.find(
      (entry) => entry.message === "Configured agent tools are not available.",
    );

    expect((diagnostic?.data as { tools?: string[] })?.tools).toEqual(["tools.missing"]);
    expect(readSnapshotFromTrace(result.trace)?.toolAllowlist).toEqual(["tools.search"]);
  });

  it("treats empty global allowlists as unrestricted", async () => {
    const tools = [{ name: "tools.search" }, { name: "tools.write" }];
    const config = { tools: { allowlist: [" ", ""] } };
    const runtime = createAgentRuntime({
      model: createBuiltinModel(),
      adapters: { tools },
      config,
    });

    const result = await runtime.run({ text: "hello" });

    expect(
      filterAgentTools(resolveAgentExecutionProfile(config), tools)?.map((tool) => tool.name),
    ).toEqual(["tools.search", "tools.write"]);
    expect(readSnapshotFromTrace(result.trace)?.toolAllowlist).toBeUndefined();
    expect(
      result.diagnostics.some(
        (entry) => entry.message === "Configured agent tools are not available.",
      ),
    ).toBe(false);
  });

  it("preserves an explicitly empty selected-agent tool scope", () => {
    const tools = [{ name: "tools.search" }];
    const profile = resolveAgentExecutionProfile({
      agents: [{ id: "one", name: "One", prompt: "one", tools: [] }],
    });

    expect(filterAgentTools(profile, tools)).toEqual([]);
  });

  it("preserves adapter tool order when no policy is configured", () => {
    const tools = [{ name: "tools.write" }, { name: "tools.search" }];

    expect(filterAgentTools(resolveAgentExecutionProfile(), tools)).toEqual(tools);
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

  it("infers model streaming from an attached event stream", async () => {
    const runtime = createAgentRuntime({
      model: createStreamingModel(),
      adapters: { tools: createBuiltinTools() },
    });
    const recording = createRecordingEventStream();

    const result = await runtime.run({
      text: "hello",
      eventStream: recording.stream,
      interactionId: "interaction-1",
    });

    expect(result.status).toBe("ok");
    expect(recording.events.length).toBeGreaterThan(0);
    expect(recording.events.map(readEventName)).toContain("interaction.model");
  });
});
