import { describe, expect, it } from "bun:test";
import type { ChatMessage, ChatResponseChunk, LLM } from "@llamaindex/core/llms";
import {
  Tooling,
  collectStep,
  fromLlamaIndexModel,
  isPromiseLike,
  maybeToStep,
  toSchema,
} from "#adapters";

const makeMessage = (content: ChatMessage["content"]): ChatMessage => ({
  role: "assistant",
  content,
});

const createModel = (handlers: Record<string, unknown>): LLM =>
  ({
    metadata: { model: "llama" },
    chat: async () => ({
      message: makeMessage("ok"),
      raw: {},
    }),
    ...handlers,
  }) as unknown as LLM;

const asAsyncIterable = <T>(values: T[]): AsyncIterable<T> => ({
  async *[Symbol.asyncIterator]() {
    for (const value of values) {
      yield value;
    }
  },
});

describe("Adapter LlamaIndex model", () => {
  it("parses message text from structured content arrays", async () => {
    const model = createModel({
      chat: async () => ({
        message: makeMessage([{ type: "text", text: "hi" }]),
        raw: {},
      }),
    });

    const adapter = fromLlamaIndexModel(model);
    const result = await adapter.generate({ prompt: "hi" });
    expect(result.text).toBe("hi");
  });

  it("normalizes response telemetry timestamps", async () => {
    const model = createModel({
      chat: async () => ({
        message: makeMessage("ok"),
        raw: { created: 1000 },
      }),
    });

    const adapter = fromLlamaIndexModel(model);
    const result = await adapter.generate({ prompt: "hi" });
    expect(result.telemetry?.response?.timestamp).toBe(1_000_000);
  });

  it("emits diagnostics when schema parsing fails in exec", async () => {
    let captured: { messages?: ChatMessage[] } | undefined;
    const model = createModel({
      exec: async (options: { messages: ChatMessage[] }) => {
        captured = { messages: options.messages };
        return {
          newMessages: [makeMessage("not json")],
          toolCalls: [],
          raw: { usage: { input_tokens: 1 } },
        };
      },
    });

    const adapter = fromLlamaIndexModel(model);
    const result = await adapter.generate({
      prompt: "hi",
      system: "sys",
      responseSchema: toSchema({ type: "object", properties: {} }),
    });

    expect(result.diagnostics?.map((entry) => entry.message)).toContain(
      "response_schema_parse_failed",
    );
    const items = Array.isArray(captured?.messages) ? captured?.messages : [];
    expect(items[0]?.role).toBe("system");
  });

  it("captures usage when provided in exec raw payloads", async () => {
    const model = createModel({
      exec: async (options: { messages: ChatMessage[] }) => {
        void options;
        return {
          newMessages: [makeMessage("ok")],
          toolCalls: [],
          raw: { usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } },
        };
      },
    });

    const adapter = fromLlamaIndexModel(model);
    const result = await adapter.generate({
      prompt: "hi",
      responseSchema: toSchema({ type: "object", properties: {} }),
    });

    expect(result.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it("streams exec results when tools are present", async () => {
    const model = createModel({
      streamExec: async () => ({
        stream: asAsyncIterable<ChatResponseChunk>([
          { delta: "hi", raw: { usage: { input_tokens: 1 } } },
        ]),
        toolCalls: [],
      }),
    });
    const adapter = fromLlamaIndexModel(model);
    if (!adapter.stream) {
      throw new Error("stream not supported");
    }
    const events: Array<{ type: string }> = [];
    const stream = await adapter.stream({
      prompt: "hi",
      tools: [Tooling.create({ name: "search" })],
    });
    const stepResult = maybeToStep(stream);
    const step = isPromiseLike(stepResult) ? await stepResult : stepResult;
    const collected = collectStep(step);
    const items = isPromiseLike(collected) ? await collected : collected;
    events.push(...items.map((event) => ({ type: event.type })));
    expect(events[0]?.type).toBe("start");
    expect(events.at(-1)?.type).toBe("end");
  });

  it("returns an error event when streaming with response schemas", async () => {
    const model = createModel({});
    const adapter = fromLlamaIndexModel(model);
    if (!adapter.stream) {
      throw new Error("stream not supported");
    }
    const events: Array<{ type: string }> = [];
    const stream = await adapter.stream({
      prompt: "hi",
      responseSchema: toSchema({ type: "object", properties: {} }),
    });
    const stepResult = maybeToStep(stream);
    const step = isPromiseLike(stepResult) ? await stepResult : stepResult;
    const collected = collectStep(step);
    const items = isPromiseLike(collected) ? await collected : collected;
    events.push(...items.map((event) => ({ type: event.type })));
    expect(events[0]?.type).toBe("error");
  });
});
