import { describe, expect, it } from "bun:test";
import type { Tool } from "../../src/adapters/types";
import {
  createSubagentTools,
  buildSubagentRuntimeOptions,
} from "../../src/interaction/agent-runtime-subagents";
import type {
  AgentRuntime,
  AgentRuntimeInput,
  AgentRuntimeOptions,
} from "../../src/interaction/agent-runtime";
import { createTraceDiagnostics } from "../../src/shared/reporting";
import type { Outcome } from "../../src/workflow/types";

const createOkOutcome = (): Outcome<unknown> => ({
  status: "ok",
  artefact: {},
  ...createTraceDiagnostics(),
});

const createRuntime = (): AgentRuntime => ({
  run: (_input: AgentRuntimeInput) => createOkOutcome(),
  stream: (_input: AgentRuntimeInput) => createOkOutcome(),
});

const createRuntimeFactory = () => createRuntime();

const createRuntimeOptions = (): AgentRuntimeOptions => ({
  model: { generate: () => ({ text: "ok" }) },
});

const readTool = (tools: Tool[] | null, name: string): Tool => {
  if (!tools) {
    throw new Error("Missing tools.");
  }
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Missing tool ${name}.`);
  }
  return tool;
};

type ToolExecute = NonNullable<Tool["execute"]>;

const requireToolExecute = (tool: Tool): ToolExecute => {
  if (!tool.execute) {
    throw new Error(`Tool ${tool.name} is missing execute.`);
  }
  return tool.execute;
};

const readErrorCode = (result: unknown): string | null => {
  if (!result || typeof result !== "object") {
    return null;
  }
  return (result as { error?: string }).error ?? null;
};

describe("subagent tools", () => {
  it("disables tools when subagents are disabled", () => {
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
      options: { enabled: false },
    });

    expect(tools).toBeNull();
  });

  it("spawns, waits, and closes subagents", async () => {
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
    });
    const spawn = readTool(tools, "agent.spawn");
    const wait = readTool(tools, "agent.wait");
    const close = readTool(tools, "agent.close");
    const spawnExecute = requireToolExecute(spawn);
    const waitExecute = requireToolExecute(wait);
    const closeExecute = requireToolExecute(close);

    const spawned = await spawnExecute({ agentId: "agent-1" });
    expect((spawned as { status?: string }).status).toBe("started");

    const waiting = await waitExecute({ agentId: "agent-1" });
    expect((waiting as { outcome?: unknown }).outcome).toBeNull();

    const closed = await closeExecute({ agentId: "agent-1" });
    expect((closed as { closed?: boolean }).closed).toBe(true);
  });

  it("returns invalid input errors for malformed requests", async () => {
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
    });
    const send = readTool(tools, "agent.send");
    const wait = readTool(tools, "agent.wait");
    const close = readTool(tools, "agent.close");
    const sendExecute = requireToolExecute(send);
    const waitExecute = requireToolExecute(wait);
    const closeExecute = requireToolExecute(close);

    const invalidSend = await sendExecute({});
    const invalidWait = await waitExecute({});
    const invalidClose = await closeExecute({});

    expect(readErrorCode(invalidSend)).toBe("subagent_invalid_input");
    expect(readErrorCode(invalidWait)).toBe("subagent_invalid_input");
    expect(readErrorCode(invalidClose)).toBe("subagent_invalid_input");
  });

  it("enforces subagent limits", async () => {
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
      options: { maxActive: 1 },
    });
    const spawn = readTool(tools, "agent.spawn");
    const spawnExecute = requireToolExecute(spawn);

    await spawnExecute({ agentId: "agent-1" });
    const second = await spawnExecute({ agentId: "agent-2" });

    expect(readErrorCode(second)).toBe("subagent_limit_reached");
  });

  it("disables nested subagents in runtime overrides", () => {
    const runtimeOptions = buildSubagentRuntimeOptions({
      model: { generate: () => ({ text: "ok" }) },
      subagents: { enabled: true },
    });

    expect(runtimeOptions.subagents?.enabled).toBe(false);
  });
});
