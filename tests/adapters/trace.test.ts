import { describe, expect, it } from "bun:test";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { fromLangChainCallbackHandler, type AdapterTraceEvent } from "#adapters";
import { bindFirst } from "../../src/shared/maybe";

type TraceCapture = {
  name: string;
  data: unknown;
  runId: string;
  metadata?: Record<string, unknown>;
};

type ChainStartCapture = {
  runId: string;
  inputs: Record<string, unknown>;
};

type ChainEndCapture = {
  runId: string;
  outputs: Record<string, unknown>;
};

type ChainErrorCapture = {
  runId: string;
  error: Error;
};

type LlmEndCapture = {
  runId: string;
  output: unknown;
};

type TraceEventInput = {
  events: TraceCapture[];
  eventName: string;
  data: unknown;
  runId: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

const recordTraceEvent = (input: TraceEventInput) => {
  void input.tags;
  input.events.push({
    name: input.eventName,
    data: input.data,
    runId: input.runId,
    metadata: input.metadata,
  });
};

const recordTraceEventArgs = (
  events: TraceCapture[],
  ...args: [
    eventName: string,
    data: unknown,
    runId: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ]
) =>
  recordTraceEvent({
    events,
    eventName: args[0],
    data: args[1],
    runId: args[2],
    tags: args[3],
    metadata: args[4],
  });

type ChainStartInput = {
  events: ChainStartCapture[];
  chain: unknown;
  inputs: Record<string, unknown>;
  runId: string;
};

const recordChainStart = (input: ChainStartInput) => {
  void input.chain;
  input.events.push({ runId: input.runId, inputs: input.inputs });
};

const recordChainStartArgs = (
  events: ChainStartCapture[],
  ...args: [chain: unknown, inputs: Record<string, unknown>, runId: string]
) => recordChainStart({ events, chain: args[0], inputs: args[1], runId: args[2] });

type ChainEndInput = {
  events: ChainEndCapture[];
  outputs: Record<string, unknown>;
  runId: string;
};

const recordChainEnd = (input: ChainEndInput) => {
  input.events.push({ runId: input.runId, outputs: input.outputs });
};

const recordChainEndArgs = (
  events: ChainEndCapture[],
  ...args: [outputs: Record<string, unknown>, runId: string]
) => recordChainEnd({ events, outputs: args[0], runId: args[1] });

type ChainErrorInput = {
  events: ChainErrorCapture[];
  error: unknown;
  runId: string;
};

const recordChainError = (input: ChainErrorInput) => {
  input.events.push({
    runId: input.runId,
    error: input.error instanceof Error ? input.error : new Error(String(input.error)),
  });
};

const recordChainErrorArgs = (
  events: ChainErrorCapture[],
  ...args: [error: unknown, runId: string]
) => recordChainError({ events, error: args[0], runId: args[1] });

type LlmEndInput = {
  events: LlmEndCapture[];
  output: unknown;
  runId: string;
};

const recordLlmEnd = (input: LlmEndInput) => {
  input.events.push({ runId: input.runId, output: input.output });
};

const recordLlmEndArgs = (events: LlmEndCapture[], ...args: [output: unknown, runId: string]) =>
  recordLlmEnd({ events, output: args[0], runId: args[1] });

const createHandler = (events: TraceCapture[]) =>
  BaseCallbackHandler.fromMethods({
    handleCustomEvent: bindFirst(recordTraceEventArgs, events),
  });

type LifecycleHandlerInput = {
  traceEvents: TraceCapture[];
  chainStarts: ChainStartCapture[];
  chainEnds: ChainEndCapture[];
  chainErrors: ChainErrorCapture[];
  llmEnds: LlmEndCapture[];
};

const createLifecycleHandler = (input: LifecycleHandlerInput) =>
  BaseCallbackHandler.fromMethods({
    handleCustomEvent: bindFirst(recordTraceEventArgs, input.traceEvents),
    handleChainStart: bindFirst(recordChainStartArgs, input.chainStarts),
    handleChainEnd: bindFirst(recordChainEndArgs, input.chainEnds),
    handleChainError: bindFirst(recordChainErrorArgs, input.chainErrors),
    handleLLMEnd: bindFirst(recordLlmEndArgs, input.llmEnds),
  });

const createNoopHandler = () => BaseCallbackHandler.fromMethods({});

const makeEvent = (overrides: Partial<AdapterTraceEvent> = {}): AdapterTraceEvent => ({
  name: "run.start",
  data: { ok: true },
  id: "run-1",
  modelId: "model-1",
  timestamp: 123,
  ...overrides,
});

describe("Adapter trace", () => {
  it("forwards trace events to LangChain callback handlers", async () => {
    const events: TraceCapture[] = [];
    const handler = createHandler(events);
    const sink = fromLangChainCallbackHandler(handler);

    await sink.emit(makeEvent());

    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe("run.start");
    expect(events[0]?.runId).toBe("run-1");
    expect(events[0]?.data).toEqual({ ok: true });
    expect(events[0]?.metadata).toEqual({ modelId: "model-1", timestamp: 123 });
  });

  it("emits multiple trace events in order", async () => {
    const events: TraceCapture[] = [];
    const handler = createHandler(events);
    const sink = fromLangChainCallbackHandler(handler);
    const first = makeEvent({ id: "run-1" });
    const second = makeEvent({ id: "run-2", name: "run.end" });

    await sink.emitMany?.([first, second]);

    expect(events.map((event) => event.runId)).toEqual(["run-1", "run-2"]);
    expect(events.map((event) => event.name)).toEqual(["run.start", "run.end"]);
  });

  it("maps workflow lifecycle events into LangChain callbacks", async () => {
    const traceEvents: TraceCapture[] = [];
    const chainStarts: ChainStartCapture[] = [];
    const chainEnds: ChainEndCapture[] = [];
    const chainErrors: ChainErrorCapture[] = [];
    const llmEnds: LlmEndCapture[] = [];
    const handler = createLifecycleHandler({
      traceEvents,
      chainStarts,
      chainEnds,
      chainErrors,
      llmEnds,
    });
    const sink = fromLangChainCallbackHandler(handler);

    await sink.emit(makeEvent({ name: "run.start", id: "run-start", data: { input: "hi" } }));
    await sink.emit(
      makeEvent({ name: "run.end", id: "run-ok", data: { status: "ok", output: "ok" } }),
    );
    await sink.emit(makeEvent({ name: "provider.response", id: "llm-1", data: { id: "resp" } }));

    expect(chainStarts).toHaveLength(1);
    expect(chainStarts[0]?.runId).toBe("run-start");
    expect(chainStarts[0]?.inputs).toEqual({ input: "hi" });
    expect(chainEnds).toHaveLength(1);
    expect(chainEnds[0]?.runId).toBe("run-ok");
    expect(chainEnds[0]?.outputs).toEqual({ status: "ok", output: "ok" });
    expect(llmEnds).toHaveLength(1);
    expect(llmEnds[0]?.runId).toBe("llm-1");
    expect(traceEvents).toHaveLength(3);
  });

  it("maps run.error into LangChain chain errors", async () => {
    const traceEvents: TraceCapture[] = [];
    const chainStarts: ChainStartCapture[] = [];
    const chainEnds: ChainEndCapture[] = [];
    const chainErrors: ChainErrorCapture[] = [];
    const llmEnds: LlmEndCapture[] = [];
    const handler = createLifecycleHandler({
      traceEvents,
      chainStarts,
      chainEnds,
      chainErrors,
      llmEnds,
    });
    const sink = fromLangChainCallbackHandler(handler);
    const error = new Error("boom");

    await sink.emit(
      makeEvent({ name: "run.end", id: "run-error", data: { status: "error", error } }),
    );

    expect(chainErrors).toHaveLength(1);
    expect(chainErrors[0]?.runId).toBe("run-error");
    expect(chainErrors[0]?.error.message).toBe("boom");
  });

  it("coerces non-error payloads into errors", async () => {
    const traceEvents: TraceCapture[] = [];
    const chainStarts: ChainStartCapture[] = [];
    const chainEnds: ChainEndCapture[] = [];
    const chainErrors: ChainErrorCapture[] = [];
    const llmEnds: LlmEndCapture[] = [];
    const handler = createLifecycleHandler({
      traceEvents,
      chainStarts,
      chainEnds,
      chainErrors,
      llmEnds,
    });
    const sink = fromLangChainCallbackHandler(handler);

    await sink.emit(
      makeEvent({ name: "run.end", id: "run-error", data: { status: "error", error: "oops" } }),
    );

    expect(chainErrors).toHaveLength(1);
    expect(chainErrors[0]?.error.message).toBe("oops");
  });

  it("normalizes undefined lifecycle payloads to empty records", async () => {
    const traceEvents: TraceCapture[] = [];
    const chainStarts: ChainStartCapture[] = [];
    const chainEnds: ChainEndCapture[] = [];
    const chainErrors: ChainErrorCapture[] = [];
    const llmEnds: LlmEndCapture[] = [];
    const handler = createLifecycleHandler({
      traceEvents,
      chainStarts,
      chainEnds,
      chainErrors,
      llmEnds,
    });
    const sink = fromLangChainCallbackHandler(handler);

    await sink.emit(makeEvent({ name: "run.start", data: undefined }));

    expect(chainStarts[0]?.inputs).toEqual({});
  });

  it("no-ops when the handler does not support custom events", async () => {
    const handler = createNoopHandler();
    const sink = fromLangChainCallbackHandler(handler);

    await sink.emit(makeEvent());

    expect(handler).toBeDefined();
  });
});
