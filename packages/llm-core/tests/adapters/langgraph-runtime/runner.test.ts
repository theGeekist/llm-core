import { describe, expect, test } from "bun:test";
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import {
  contractVersion,
  newCoreId,
  type EventId,
  type InvocationId,
  type RunId,
} from "#contracts";
import type { AgentEvent, AgentOutput } from "../../../src/features/agent/public";
import {
  createLangGraphRunner,
  LANGGRAPH_RUNTIME_VERSION,
  LangGraphRuntimeError,
  langGraphRuntimeSourceContract,
  type LangGraphAdapterState,
  type LangGraphCompiledGraphPort,
  type LangGraphRunnableConfig,
} from "../../../src/adapters/langgraph-runtime/public";

const IDS = [
  "018f0f4e-8c5b-7a91-8c3b-123456789a01",
  "018f0f4e-8c5b-7a91-8c3b-123456789a02",
  "018f0f4e-8c5b-7a91-8c3b-123456789a03",
  "018f0f4e-8c5b-7a91-8c3b-123456789a05",
  "018f0f4e-8c5b-7a91-8c3b-123456789a06",
  "018f0f4e-8c5b-7a91-8c3b-123456789a07",
  "018f0f4e-8c5b-7a91-8c3b-123456789a08",
] as const;
const INVOCATION_ID = newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789a04");

const identity = () => {
  let index = 0;
  return {
    runId: () => newCoreId<RunId>(IDS[index++]!),
    eventId: () => newCoreId<EventId>(IDS[index++]!),
    now: () => "2026-09-05T00:00:00.000Z",
  };
};

const State = Annotation.Root({
  agentId: Annotation<string>,
  agentVersion: Annotation<string>,
  instructions: Annotation<string>,
  input: Annotation<LangGraphAdapterState["input"]>,
  trace: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  output: Annotation<AgentOutput>,
});

const asPort = (graph: object): LangGraphCompiledGraphPort => {
  const compiled = graph as {
    invoke(input: LangGraphAdapterState, config: LangGraphRunnableConfig): Promise<unknown>;
    getState(config: Pick<LangGraphRunnableConfig, "configurable">): Promise<unknown>;
  };
  return {
    invoke: (input, config) => compiled.invoke(input, config),
    getState: (config) => compiled.getState(config),
  };
};

const createGraph = () =>
  new StateGraph(State)
    .addNode("left", () => ({ trace: ["left"] }))
    .addNode("right", () => ({ trace: ["right"] }))
    .addNode("finish", (state) => ({
      output: {
        kind: "json" as const,
        value: { input: state.input, trace: [...state.trace].sort() },
      },
    }))
    .addEdge(START, "left")
    .addEdge(START, "right")
    .addEdge(["left", "right"], "finish")
    .addEdge("finish", END)
    .compile({ checkpointer: new MemorySaver() });

const runnerFor = (
  graph: LangGraphCompiledGraphPort = asPort(createGraph()),
  identityPort = identity(),
) =>
  createLangGraphRunner({
    graph,
    identity: identityPort,
    sourceContract: langGraphRuntimeSourceContract,
  });

const request = async (runner: ReturnType<typeof runnerFor>) => ({
  agent: await runner.prepare({
    agentId: "langgraph-fixture",
    version: contractVersion("1.0.0"),
    instructions: "Exercise the exact LangGraph runtime.",
    effectRequirement: "read-only",
  }),
  invocationContext: { invocationId: INVOCATION_ID },
  input: { prompt: "hello" },
});

describe("LangGraph 1.0.7 runtime adapter", () => {
  test("pins exact support and preserves native semantics separately", () => {
    const runner = runnerFor();
    expect(LANGGRAPH_RUNTIME_VERSION).toBe("1.0.7");
    expect(runner.capabilities()).toEqual({
      runnerId: "llm-core.langgraph.runtime",
      runnerVersion: contractVersion("1.0.7"),
      controlledEffects: false,
      cancellation: "cooperative",
      interventions: false,
      checkpointResume: false,
      providerSessionContinuation: false,
      durableExecutionSignalling: false,
      childRuns: false,
    });
    expect(runner.operations).toMatchObject({
      adapterId: "llm-core.runtime.langgraph",
      assessedRelease: "1.0.7",
      supportedReleaseRange: "==1.0.7",
    });
    expect(new Set(runner.operations.operations.map((operation) => operation.disposition))).toEqual(
      new Set(["supported", "unsupported"]),
    );
    expect(
      runner.operations.operations.find(
        (operation) => operation.operation === "portable.agent.intervene",
      )?.disposition,
    ).toBe("unsupported");
    expect(runner.resume).toBeUndefined();
  });

  test("executes graph reducers under one checkpointed native thread", async () => {
    const runner = runnerFor();
    const run = runner.start(await request(runner));
    const [result, events, observation] = await Promise.all([
      run.result(),
      Array.fromAsync(run.events()),
      runner.observe(run),
    ]);

    expect(result).toMatchObject({
      status: "completed",
      output: { kind: "json", value: { input: { prompt: "hello" }, trace: ["left", "right"] } },
    });
    expect(events.map((event) => event.kind)).toEqual(["agent.run.started", "agent.run.completed"]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1]);
    expect(observation).toMatchObject({
      sourceContract: langGraphRuntimeSourceContract,
      threadId: run.identity.runId,
      status: "completed",
      next: [],
      interruptCount: 0,
    });
    expect(observation.stateAvailability).toBe("available");
    if (observation.stateAvailability === "available") {
      expect(observation.checkpointId).toBeString();
    }
    expect((await run.cancel({ requestedAt: "2026-09-05T00:00:01.000Z" })).status).toBe(
      "already-terminal",
    );
  });

  test("retains native interrupts without claiming portable intervention", async () => {
    const checkpointer = new MemorySaver();
    const graph = new StateGraph(State)
      .addNode("approval", (state) => {
        const decision = interrupt<{ question: string }, string>({ question: "Continue?" });
        return {
          output: { kind: "json" as const, value: { decision, input: state.input } },
        };
      })
      .addEdge(START, "approval")
      .addEdge("approval", END)
      .compile({ checkpointer });
    const runner = runnerFor(asPort(graph));
    const run = runner.start(await request(runner));

    expect(await run.result()).toMatchObject({
      status: "failed",
      reasonCode: "langgraph-interrupted",
    });
    expect(await runner.observe(run)).toMatchObject({
      status: "interrupted",
      next: ["approval"],
      interruptCount: 1,
    });
    expect(await run.intervene({} as never)).toMatchObject({ status: "unsupported" });

    const resumed = await graph.invoke(new Command({ resume: "approved" }), {
      configurable: { thread_id: run.identity.runId },
    });
    expect(resumed.output).toEqual({
      kind: "json",
      value: { decision: "approved", input: { prompt: "hello" } },
    });
  });

  test("propagates cooperative cancellation through the native signal", async () => {
    let observedAbort = false;
    const graph: LangGraphCompiledGraphPort = {
      invoke: async (_input, config) => {
        await new Promise<void>((resolve) => {
          config.signal.addEventListener("abort", () => {
            observedAbort = true;
            resolve();
          });
        });
        throw new DOMException("The operation was aborted.", "AbortError");
      },
      getState: async () => ({ next: [], tasks: [] }),
    };
    const runner = runnerFor(graph);
    const run = runner.start(await request(runner));
    const stream = run.events()[Symbol.asyncIterator]();

    expect((await stream.next()).value?.kind).toBe("agent.run.started");

    expect((await run.cancel({ requestedAt: "2026-09-05T00:00:01.000Z" })).status).toBe(
      "acknowledged",
    );
    expect(await run.result()).toMatchObject({
      status: "cancelled",
      reasonCode: "langgraph-cancelled",
    });
    expect(observedAbort).toBe(true);
    expect((await runner.observe(run)).status).toBe("cancelled");
    const remaining: AgentEvent[] = [];
    for await (const item of { [Symbol.asyncIterator]: () => stream }) remaining.push(item);
    expect(remaining.map((item) => item.kind)).toEqual([
      "agent.run.cancellation.requested",
      "agent.run.cancellation.acknowledged",
      "agent.run.cancelled",
    ]);
  });

  test("completes without a checkpointer and reports state observation separately", async () => {
    const graph = new StateGraph(State)
      .addNode("finish", (state) => ({
        output: { kind: "json" as const, value: { input: state.input } },
      }))
      .addEdge(START, "finish")
      .addEdge("finish", END)
      .compile();
    const runner = runnerFor(asPort(graph));
    const run = runner.start(await request(runner));

    expect(await run.result()).toMatchObject({ status: "completed" });
    expect(await runner.observe(run)).toEqual({
      sourceContract: langGraphRuntimeSourceContract,
      threadId: run.identity.runId,
      status: "completed",
      stateAvailability: "unavailable",
      nativeError: {
        operation: "native.langgraph.state.read",
        code: "state-unavailable",
      },
    });
  });

  test("does not misreport an independent failure after an ignored abort", async () => {
    let reject!: (cause: Error) => void;
    const pending = new Promise<never>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const runner = runnerFor({ invoke: () => pending });
    const run = runner.start(await request(runner));

    await run.cancel({ requestedAt: "2026-09-05T00:00:01.000Z" });
    reject(new Error("independent failure"));

    expect(await run.result()).toMatchObject({
      status: "failed",
      reasonCode: "langgraph-execution-failed",
    });
    expect(await runner.observe(run)).toMatchObject({
      status: "failed",
      nativeError: {
        operation: "native.langgraph.graph.invoke",
        code: "invocation-rejected",
      },
    });
  });

  test("does not classify a graph-originated AbortError as requested cancellation", async () => {
    const runner = runnerFor({
      invoke: async () => {
        throw new DOMException("Graph aborted itself.", "AbortError");
      },
    });
    const run = runner.start(await request(runner));

    expect(await run.result()).toMatchObject({
      status: "failed",
      reasonCode: "langgraph-execution-failed",
    });
    expect(await runner.observe(run)).toMatchObject({
      nativeError: { code: "invocation-rejected" },
    });
  });

  test("closes with a failed terminal event when the terminal clock is invalid", async () => {
    let reads = 0;
    const baseIdentity = identity();
    const runner = runnerFor(
      {
        invoke: async () => ({ output: { kind: "text", text: "completed" } }),
      },
      {
        ...baseIdentity,
        now: () => (++reads === 1 ? "2026-09-05T00:00:00.000Z" : "invalid"),
      },
    );
    const run = runner.start(await request(runner));

    expect(await run.result()).toMatchObject({
      status: "failed",
      reasonCode: "langgraph-identity-time-failed",
    });
    expect((await Array.fromAsync(run.events())).map((item) => item.kind)).toEqual([
      "agent.run.started",
      "agent.run.failed",
    ]);
  });

  test("rejects hostile and malformed boundaries before graph effects", async () => {
    let invocations = 0;
    let getterReads = 0;
    const graph: LangGraphCompiledGraphPort = {
      invoke: async () => {
        invocations += 1;
        return { output: { kind: "text", text: "unexpected" } };
      },
    };
    const runner = runnerFor(graph);
    const hostileDefinition = Object.defineProperty({}, "effectRequirement", {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return "read-only";
      },
    });
    expect(() => runner.prepare(hostileDefinition as never)).toThrow("closed portable definition");
    expect(getterReads).toBe(0);

    const valid = await request(runner);
    expect(() => runner.start({ ...valid, extra: true } as never)).toThrow("closed invocation");
    expect(() =>
      runner.start({
        ...valid,
        invocationContext: { invocationId: "not-a-uuid" },
      } as never),
    ).toThrow("closed invocation");
    expect(invocations).toBe(0);

    const run = runner.start(valid);
    expect(() => runner.nativeEvents(run)).toThrow("native-event-stream-unsupported");
    expect(() => runner.start({ ...valid, providerSession: {} } as never)).toThrow(
      "no provider session",
    );
    expect(() =>
      run.cancel({
        requestedAt: "not-a-timestamp",
        reason: { token: "secret" },
      } as never),
    ).toThrow("closed safe control");
    expect(await run.result()).toMatchObject({ status: "completed" });
    const projected = await runner.observe(run);
    expect(projected).not.toHaveProperty("values");
    expect(projected).not.toHaveProperty("tasks");
  });

  test("snapshots source evidence instead of retaining caller mutation", async () => {
    const source = { ...langGraphRuntimeSourceContract };
    const runner = createLangGraphRunner({
      graph: { invoke: async () => ({ output: { kind: "text", text: "done" } }) },
      identity: identity(),
      sourceContract: source,
    });
    const run = runner.start(await request(runner));
    (source as { version: string }).version = "mutated";

    expect((await runner.observe(run)).sourceContract).toEqual(langGraphRuntimeSourceContract);
  });

  test("fails closed for foreign preparations, controlled effects, and version drift", async () => {
    const runner = runnerFor();
    expect(() =>
      runner.prepare({
        agentId: "controlled",
        version: contractVersion("1.0.0"),
        instructions: "Do not run.",
        effectRequirement: "controlled",
      }),
    ).toThrow(LangGraphRuntimeError);
    expect(() =>
      createLangGraphRunner({
        graph: asPort(createGraph()),
        identity: identity(),
        sourceContract: { ...langGraphRuntimeSourceContract, version: "1.0.8" } as never,
      }),
    ).toThrow("version-drift");
    const validRequest = await request(runner);
    expect(() => runner.start({ ...validRequest, agent: {} as never })).toThrow(
      "prepared by this runner",
    );
  });
});
