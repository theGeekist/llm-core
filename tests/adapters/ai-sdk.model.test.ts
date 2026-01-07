import { describe, expect, it, mock } from "bun:test";
import { collectStep, isPromiseLike, maybeToStep } from "../../src/shared/maybe.ts";
import { z } from "zod";
import { Tooling, toSchema } from "#adapters";
import { asAiSdkStreamPart } from "./helpers";

const asAsyncIterable = <T>(values: T[]): AsyncIterable<T> => ({
  async *[Symbol.asyncIterator]() {
    for (const value of values) {
      yield value;
    }
  },
});

const makeStreamResult = (parts: Array<ReturnType<typeof asAiSdkStreamPart>>, usage?: object) => ({
  fullStream: asAsyncIterable(parts),
  totalUsage: Promise.resolve(usage),
  finishReason: Promise.resolve("stop"),
});

const makeAiStreamModule = (result: ReturnType<typeof makeStreamResult>) => ({
  streamText: () => result,
  jsonSchema: (schema: unknown) => schema,
  zodSchema: (schema: unknown) => schema,
});

describe("Adapter AI SDK model", () => {
  it("maps named tool choice to a tool selector", async () => {
    let captured: Record<string, unknown> | undefined;

    mock.module("ai", () => ({
      generateText: (options: Record<string, unknown>) => {
        captured = options;
        return { text: "ok" };
      },
      jsonSchema: (schema: unknown) => schema,
      zodSchema: (schema: unknown) => schema,
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    await model.generate({
      prompt: "hi",
      tools: [Tooling.create({ name: "search" })],
      toolChoice: "search",
    });

    expect(captured?.toolChoice).toEqual({ type: "tool", toolName: "search" });
    mock.restore();
  });

  it("prefers messages over prompt even when empty", async () => {
    let captured: Record<string, unknown> | undefined;

    mock.module("ai", () => ({
      generateText: (options: Record<string, unknown>) => {
        captured = options;
        return { text: "ok" };
      },
      jsonSchema: (schema: unknown) => schema,
      zodSchema: (schema: unknown) => schema,
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    await model.generate({
      prompt: "ignored",
      messages: [],
    });

    expect(captured?.messages).toEqual([]);
    expect("prompt" in (captured ?? {})).toBe(false);
    mock.restore();
  });

  it("emits provider warnings from AI SDK telemetry", async () => {
    mock.module("ai", () => ({
      generateText: () => ({
        text: "ok",
        warnings: [{ note: "warn" }],
      }),
      jsonSchema: (schema: unknown) => schema,
      zodSchema: (schema: unknown) => schema,
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    const result = await model.generate({ prompt: "hi" });

    expect(result.diagnostics?.map((entry) => entry.message)).toContain("provider_warning");
    mock.restore();
  });

  it("uses zod schemas for structured outputs", async () => {
    let captured: Record<string, unknown> | undefined;

    mock.module("ai", () => ({
      generateObject: (options: Record<string, unknown>) => {
        captured = options;
        return { object: { ok: true } };
      },
      jsonSchema: () => ({ kind: "json" }),
      zodSchema: () => ({ kind: "zod" }),
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    await model.generate({
      prompt: "hi",
      responseSchema: toSchema(z.object({ ok: z.boolean() })),
    });

    expect(captured?.schema).toEqual({ kind: "zod" });
    mock.restore();
  });

  it("uses json schemas for non-zod structured outputs", async () => {
    let captured: Record<string, unknown> | undefined;

    mock.module("ai", () => ({
      generateObject: (options: Record<string, unknown>) => {
        captured = options;
        return { object: { ok: true } };
      },
      jsonSchema: () => ({ kind: "json" }),
      zodSchema: () => ({ kind: "zod" }),
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    await model.generate({
      prompt: "hi",
      responseSchema: toSchema({ type: "object", properties: {} }),
    });

    expect(captured?.schema).toEqual({ kind: "json" });
    mock.restore();
  });

  it("collapses total usage and maps tool calls/results", async () => {
    mock.module("ai", () => ({
      generateText: () => ({
        text: "ok",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        totalUsage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
        toolCalls: [{ toolCallId: "c1", toolName: "lookup", input: { q: "hi" } }],
        toolResults: [{ toolCallId: "c1", toolName: "lookup", output: { ok: true } }],
      }),
      jsonSchema: (schema: unknown) => schema,
      zodSchema: (schema: unknown) => schema,
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    const result = await model.generate({ prompt: "hi" });

    expect(result.usage).toEqual({ inputTokens: 2, outputTokens: 2, totalTokens: 4 });
    expect(result.toolCalls).toEqual([{ id: "c1", name: "lookup", arguments: { q: "hi" } }]);
    expect(result.toolResults).toEqual([
      { toolCallId: "c1", name: "lookup", result: { ok: true } },
    ]);
    mock.restore();
  });

  it("passes through tool choice values and response metadata", async () => {
    let captured: Record<string, unknown> | undefined;

    mock.module("ai", () => ({
      generateText: (options: Record<string, unknown>) => {
        captured = options;
        return {
          text: "ok",
          response: {
            id: "req-1",
            modelId: "model-1",
            timestamp: new Date(1000),
            headers: { "x-test": "ok" },
            body: { ok: true },
          },
        };
      },
      jsonSchema: (schema: unknown) => schema,
      zodSchema: (schema: unknown) => schema,
    }));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    const result = await model.generate({ prompt: "hi", toolChoice: "auto" });

    expect(captured?.toolChoice).toBe("auto");
    expect(result.telemetry?.response).toEqual({
      id: "req-1",
      modelId: "model-1",
      timestamp: 1000,
      headers: { "x-test": "ok" },
      body: { ok: true },
    });
    mock.restore();
  });

  it("streams usage and end events", async () => {
    const streamResult = makeStreamResult(
      [asAiSdkStreamPart({ type: "text-delta", id: "t1", text: "hi" })],
      { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    );
    mock.module("ai", () => makeAiStreamModule(streamResult));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    const events = [];
    const stream = model.stream?.({ prompt: "hi" });
    if (!stream) {
      throw new Error("Expected AI SDK model to expose stream()");
    }
    const stepResult = maybeToStep(stream);
    const step = isPromiseLike(stepResult) ? await stepResult : stepResult;
    const collected = collectStep(step);
    const items = isPromiseLike(collected) ? await collected : collected;
    events.push(...items);

    expect(events.map((event) => event.type)).toEqual(["delta", "usage", "end"]);
    expect(events[1]).toEqual({
      type: "usage",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    expect(events[2]).toMatchObject({ type: "end", finishReason: "stop" });
    mock.restore();
  });

  it("warns when streaming usage is unavailable", async () => {
    const streamResult = makeStreamResult(
      [asAiSdkStreamPart({ type: "text-delta", id: "t1", text: "hi" })],
      undefined,
    );
    mock.module("ai", () => makeAiStreamModule(streamResult));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    const events = [];
    const stream = model.stream?.({ prompt: "hi" });
    if (!stream) {
      throw new Error("Expected AI SDK model to expose stream()");
    }
    const stepResult = maybeToStep(stream);
    const step = isPromiseLike(stepResult) ? await stepResult : stepResult;
    const collected = collectStep(step);
    const items = isPromiseLike(collected) ? await collected : collected;
    events.push(...items);

    const endEvent = events.find((event) => event.type === "end");
    expect(endEvent).toMatchObject({
      type: "end",
      diagnostics: [{ message: "usage_unavailable", level: "warn" }],
    });
    mock.restore();
  });

  it("returns error events when streaming with response schemas", async () => {
    const streamResult = makeStreamResult([]);
    mock.module("ai", () => makeAiStreamModule(streamResult));

    const { fromAiSdkModel } = await import("../../src/adapters/ai-sdk/model.ts");
    const model = fromAiSdkModel({} as never);
    const events = [];
    const stream = model.stream?.({ prompt: "hi", responseSchema: toSchema({ type: "object" }) });
    if (!stream) {
      throw new Error("Expected AI SDK model to expose stream()");
    }
    const stepResult = maybeToStep(stream);
    const step = isPromiseLike(stepResult) ? await stepResult : stepResult;
    const collected = collectStep(step);
    const items = isPromiseLike(collected) ? await collected : collected;
    events.push(...items);

    expect(events[0]?.type).toBe("error");
    expect((events[0] as { error?: Error }).error?.message).toBe(
      "streaming_unsupported_for_response_schema",
    );
    mock.restore();
  });
});
