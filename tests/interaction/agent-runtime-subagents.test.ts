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

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const createDeferred = <T>(): Deferred<T> => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolveFn) => {
    resolve = resolveFn;
  });
  return { promise, resolve };
};

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

const createDeferredRuntimeFactory = (deferred: Deferred<Outcome<unknown>>) => () => ({
  run: (_input: AgentRuntimeInput) => deferred.promise,
  stream: (_input: AgentRuntimeInput) => createOkOutcome(),
});

const createThrowingRuntimeFactory = () => ({
  run: (_input: AgentRuntimeInput) => {
    throw new Error("boom");
  },
  stream: (_input: AgentRuntimeInput) => createOkOutcome(),
});

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

  it("spawns with a default id and respawns after close", async () => {
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
    });
    const spawn = readTool(tools, "agent.spawn");
    const close = readTool(tools, "agent.close");
    const spawnExecute = requireToolExecute(spawn);
    const closeExecute = requireToolExecute(close);

    const spawned = await spawnExecute({});
    expect((spawned as { agentId?: string }).agentId).toBe("subagent.1");

    await closeExecute({ agentId: "subagent.1" });
    const respawned = await spawnExecute({ agentId: "subagent.1" });
    expect((respawned as { status?: string }).status).toBe("started");
  });

  it("returns exists when spawning the same active agent", async () => {
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
    });
    const spawn = readTool(tools, "agent.spawn");
    const spawnExecute = requireToolExecute(spawn);

    await spawnExecute({ agentId: "agent-1" });
    const spawnedAgain = await spawnExecute({ agentId: "agent-1" });

    expect((spawnedAgain as { status?: string }).status).toBe("exists");
  });

  it("returns not found errors for unknown subagents", async () => {
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

    const missingSend = await sendExecute({ agentId: "missing", text: "hi" });
    const missingWait = await waitExecute({ agentId: "missing" });
    const missingClose = await closeExecute({ agentId: "missing" });

    expect(readErrorCode(missingSend)).toBe("subagent_not_found");
    expect(readErrorCode(missingWait)).toBe("subagent_not_found");
    expect(readErrorCode(missingClose)).toBe("subagent_not_found");
  });

  it("rejects send when a subagent is already running", async () => {
    const deferred = createDeferred<Outcome<unknown>>();
    const tools = createSubagentTools({
      factory: createDeferredRuntimeFactory(deferred),
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
    });
    const spawn = readTool(tools, "agent.spawn");
    const send = readTool(tools, "agent.send");
    const spawnExecute = requireToolExecute(spawn);
    const sendExecute = requireToolExecute(send);

    await spawnExecute({ agentId: "agent-1" });
    const firstRun = sendExecute({ agentId: "agent-1", text: "hi" });
    const secondRun = await sendExecute({ agentId: "agent-1", text: "again" });

    expect(readErrorCode(secondRun)).toBe("subagent_busy");

    deferred.resolve(createOkOutcome());
    await firstRun;
  });

  it("returns the last outcome when waiting after a send", async () => {
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
    });
    const spawn = readTool(tools, "agent.spawn");
    const send = readTool(tools, "agent.send");
    const wait = readTool(tools, "agent.wait");
    const spawnExecute = requireToolExecute(spawn);
    const sendExecute = requireToolExecute(send);
    const waitExecute = requireToolExecute(wait);

    await spawnExecute({ agentId: "agent-1" });
    await sendExecute({ agentId: "agent-1", text: "hi" });
    const waiting = await waitExecute({ agentId: "agent-1" });

    expect((waiting as { outcome?: Outcome<unknown> }).outcome?.status).toBe("ok");
  });

  it("returns error outcomes when subagent runs throw", async () => {
    const tools = createSubagentTools({
      factory: createThrowingRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
    });
    const spawn = readTool(tools, "agent.spawn");
    const send = readTool(tools, "agent.send");
    const spawnExecute = requireToolExecute(spawn);
    const sendExecute = requireToolExecute(send);

    await spawnExecute({ agentId: "agent-1" });
    const result = await sendExecute({ agentId: "agent-1", text: "hi" });

    expect((result as { outcome?: Outcome<unknown> }).outcome?.status).toBe("error");
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
