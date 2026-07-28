import { describe, expect, it } from "bun:test";
import type { EventStreamEvent, Tool } from "../../src/adapters/types";
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
import { createAgentEventState } from "../../src/interaction/agent-runtime-events";
import type { InteractionEvent } from "../../src/interaction/types";
import { isPromiseLike } from "../../src/shared/maybe";

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
});

const createRuntimeFactory = () => createRuntime();

const createDeferredRuntimeFactory = (deferred: Deferred<Outcome<unknown>>) => () => ({
  run: (_input: AgentRuntimeInput) => deferred.promise,
});

const createThrowingRuntimeFactory = () => ({
  run: (_input: AgentRuntimeInput) => {
    throw new Error("boom");
  },
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

const readInteractionEvent = (event: EventStreamEvent): InteractionEvent | null => {
  const value = event.data?.event;
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as InteractionEvent;
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

  it("exposes the four control tools in stable order", () => {
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
    });

    expect(tools?.map((tool) => tool.name)).toEqual([
      "agent.spawn",
      "agent.send",
      "agent.wait",
      "agent.close",
    ]);
  });

  it("preserves synchronous tool results for synchronous runtimes", () => {
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
    });
    const spawn = requireToolExecute(readTool(tools, "agent.spawn"));
    const send = requireToolExecute(readTool(tools, "agent.send"));
    const wait = requireToolExecute(readTool(tools, "agent.wait"));
    const close = requireToolExecute(readTool(tools, "agent.close"));

    expect(isPromiseLike(spawn({ agentId: "agent-1" }))).toBe(false);
    expect(isPromiseLike(send({ agentId: "agent-1", text: "hi" }))).toBe(false);
    expect(isPromiseLike(wait({ agentId: "agent-1" }))).toBe(false);
    expect(isPromiseLike(close({ agentId: "agent-1" }))).toBe(false);
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

  it("keeps a closed subagent closed when an in-flight run settles", async () => {
    const deferred = createDeferred<Outcome<unknown>>();
    const tools = createSubagentTools({
      factory: createDeferredRuntimeFactory(deferred),
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
    });
    const spawnExecute = requireToolExecute(readTool(tools, "agent.spawn"));
    const sendExecute = requireToolExecute(readTool(tools, "agent.send"));
    const closeExecute = requireToolExecute(readTool(tools, "agent.close"));

    await spawnExecute({ agentId: "agent-1" });
    const inFlight = sendExecute({ agentId: "agent-1", text: "hi" });
    await closeExecute({ agentId: "agent-1" });
    deferred.resolve(createOkOutcome());
    await inFlight;

    const respawned = await spawnExecute({ agentId: "agent-1" });
    expect((respawned as { status?: string }).status).toBe("started");
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
    const events: EventStreamEvent[] = [];
    const tools = createSubagentTools({
      factory: createThrowingRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
      eventStream: {
        emit: (event) => {
          events.push(event);
          return true;
        },
      },
      eventState: createAgentEventState({
        interactionId: "root",
        correlationId: "correlation-1",
      }),
    });
    const spawn = readTool(tools, "agent.spawn");
    const send = readTool(tools, "agent.send");
    const spawnExecute = requireToolExecute(spawn);
    const sendExecute = requireToolExecute(send);

    await spawnExecute({ agentId: "agent-1" });
    const result = await sendExecute({ agentId: "agent-1", text: "hi" });

    expect((result as { outcome?: Outcome<unknown> }).outcome?.status).toBe("error");
    expect(events.map(readInteractionEvent).map((event) => event?.kind)).toEqual([
      "subagent",
      "subagent",
    ]);
    expect(
      events
        .map(readInteractionEvent)
        .map((event) => (event?.kind === "subagent" ? event.event.type : null)),
    ).toEqual(["started", "failed"]);
  });

  it("preserves lifecycle event order and subagent metadata", async () => {
    const events: EventStreamEvent[] = [];
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
      eventStream: {
        emit: (event) => {
          events.push(event);
          return true;
        },
      },
      eventState: createAgentEventState({
        interactionId: "root",
        correlationId: "correlation-1",
      }),
    });
    const spawn = requireToolExecute(readTool(tools, "agent.spawn"));
    const send = requireToolExecute(readTool(tools, "agent.send"));
    const close = requireToolExecute(readTool(tools, "agent.close"));

    await spawn({
      agentId: "agent-1",
      name: "Researcher",
      description: "Searches repositories",
      tools: ["tools.search"],
    });
    await send({ agentId: "agent-1", text: "hi" });
    await close({ agentId: "agent-1" });

    const interactionEvents = events.map(readInteractionEvent);
    expect(
      interactionEvents.map((event) => (event?.kind === "subagent" ? event.event.type : null)),
    ).toEqual(["started", "completed", "completed"]);
    expect(interactionEvents.map((event) => event?.meta.sequence)).toEqual([1, 2, 3]);
    const started = interactionEvents[0];
    if (started?.kind !== "subagent") {
      throw new Error("Expected a subagent event.");
    }
    expect(started.event.agent).toEqual({
      id: "agent-1",
      name: "Researcher",
      displayName: "Researcher",
      description: "Searches repositories",
      tools: ["tools.search"],
    });
    expect(started.meta.sourceId).toBe("agent.agent-1");
    expect(started.meta.correlationId).toBe("correlation-1");
  });

  it("awaits asynchronous lifecycle emissions", async () => {
    const emitted = createDeferred<boolean>();
    const tools = createSubagentTools({
      factory: createRuntimeFactory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
      eventStream: { emit: () => emitted.promise },
      eventState: createAgentEventState({
        interactionId: "root",
        correlationId: "correlation-1",
      }),
    });
    const spawn = requireToolExecute(readTool(tools, "agent.spawn"));

    const result = spawn({ agentId: "agent-1" });
    expect(isPromiseLike(result)).toBe(true);
    emitted.resolve(true);
    expect((await result) as { agentId?: string; status?: string }).toEqual({
      agentId: "agent-1",
      status: "started",
    });
  });

  it("builds isolated run context from canonical inputs", async () => {
    let captured: AgentRuntimeInput | null = null;
    const factory = () => ({
      run: (input: AgentRuntimeInput) => {
        captured = input;
        return createOkOutcome();
      },
    });
    const tools = createSubagentTools({
      factory,
      runtimeOptions: createRuntimeOptions(),
      interactionId: "root",
      eventState: createAgentEventState({
        interactionId: "root",
        correlationId: "correlation-1",
      }),
    });
    const spawn = requireToolExecute(readTool(tools, "agent.spawn"));
    const send = requireToolExecute(readTool(tools, "agent.send"));

    await spawn({ agentId: "agent-1" });
    await send({
      agentId: "agent-1",
      text: "hello",
      context: "repository",
      threadId: "thread-1",
    });

    expect(captured).toMatchObject({
      text: "hello",
      context: "repository",
      threadId: "thread-1",
      interactionId: "root.subagent.agent-1",
      correlationId: "correlation-1",
    });
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

  it("restricts spawned runtimes to the requested tools", async () => {
    const captured: AgentRuntimeOptions[] = [];
    const factory = (options: AgentRuntimeOptions) => {
      captured.push(options);
      return createRuntime();
    };
    const tools = createSubagentTools({
      factory,
      runtimeOptions: {
        ...createRuntimeOptions(),
        adapters: {
          tools: [
            { name: "tools.search", execute: () => "search" },
            { name: "tools.write", execute: () => "write" },
          ],
        },
      },
      interactionId: "root",
    });
    const spawn = requireToolExecute(readTool(tools, "agent.spawn"));

    await spawn({ agentId: "agent-1", tools: ["tools.search"] });

    expect(captured[0]?.adapters?.tools?.map((tool) => tool.name)).toEqual(["tools.search"]);
  });
});
