import { describe, expect, it } from "bun:test";
import { toModelStreamEvents } from "#adapters";
import { asAiSdkStreamPart } from "./helpers";
import { toToolCallFromPart, toToolResultFromPart } from "../../src/adapters/ai-sdk/stream-utils";

const asAsyncIterable = <T>(values: T[]): AsyncIterable<T> => ({
  async *[Symbol.asyncIterator]() {
    for (const value of values) {
      yield value;
    }
  },
});

describe("Adapter AI SDK streaming", () => {
  it("maps text stream parts to model stream events", async () => {
    const parts = asAsyncIterable([
      asAiSdkStreamPart({ type: "text-start", id: "t1" }),
      asAiSdkStreamPart({ type: "text-delta", id: "t1", text: "hello" }),
      asAiSdkStreamPart({ type: "text-end", id: "t1" }),
    ]);

    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of toModelStreamEvents(parts)) {
      events.push({ type: event.type, text: "text" in event ? event.text : undefined });
    }

    expect(events).toEqual([
      { type: "start", text: undefined },
      { type: "delta", text: "hello" },
      { type: "delta", text: undefined },
    ]);
  });

  it("emits a single start event when multiple start parts are present", async () => {
    const parts = asAsyncIterable([
      asAiSdkStreamPart({ type: "text-start", id: "t1" }),
      asAiSdkStreamPart({ type: "reasoning-start", id: "t1" }),
      asAiSdkStreamPart({ type: "reasoning-delta", id: "t1", text: "think" }),
    ]);

    const events: Array<{ type: string; text?: string; reasoning?: string }> = [];
    for await (const event of toModelStreamEvents(parts)) {
      events.push({
        type: event.type,
        text: "text" in event ? event.text : undefined,
        reasoning: "reasoning" in event ? event.reasoning : undefined,
      });
    }

    expect(events).toEqual([
      { type: "start", text: undefined, reasoning: undefined },
      { type: "delta", text: undefined, reasoning: undefined },
      { type: "delta", text: undefined, reasoning: "think" },
    ]);
  });

  it("injects a start event when the stream begins with a delta", async () => {
    const parts = asAsyncIterable([asAiSdkStreamPart({ type: "text-delta", text: "hi" })]);

    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of toModelStreamEvents(parts)) {
      events.push({ type: event.type, text: "text" in event ? event.text : undefined });
    }

    expect(events).toEqual([
      { type: "start", text: undefined },
      { type: "delta", text: "hi" },
    ]);
  });

  it("maps tool stream parts to tool call/result events", async () => {
    const parts = asAsyncIterable([
      asAiSdkStreamPart({
        type: "tool-call",
        toolCallId: "c1",
        toolName: "lookup",
        input: { q: "hi" },
      }),
      asAiSdkStreamPart({
        type: "tool-result",
        toolCallId: "c1",
        toolName: "lookup",
        output: { ok: true },
      }),
      asAiSdkStreamPart({ type: "tool-error", toolCallId: "c2", toolName: "fail", error: "boom" }),
    ]);

    const events: Array<{ type: string; toolCall?: object; toolResult?: object }> = [];
    for await (const event of toModelStreamEvents(parts)) {
      events.push({
        type: event.type,
        toolCall: "toolCall" in event ? event.toolCall : undefined,
        toolResult: "toolResult" in event ? event.toolResult : undefined,
      });
    }

    expect(events).toEqual([
      {
        type: "start",
        toolCall: undefined,
        toolResult: undefined,
      },
      {
        type: "delta",
        toolCall: { id: "c1", name: "lookup", arguments: { q: "hi" } },
        toolResult: undefined,
      },
      {
        type: "delta",
        toolCall: undefined,
        toolResult: { toolCallId: "c1", name: "lookup", result: { ok: true } },
      },
      {
        type: "delta",
        toolCall: undefined,
        toolResult: { toolCallId: "c2", name: "fail", result: "boom", isError: true },
      },
    ]);
  });

  it("maps error stream parts to error events", async () => {
    const parts = asAsyncIterable([asAiSdkStreamPart({ type: "error", error: new Error("boom") })]);

    const events: Array<{ type: string; error?: Error }> = [];
    for await (const event of toModelStreamEvents(parts)) {
      events.push({
        type: event.type,
        error: "error" in event ? (event.error as Error) : undefined,
      });
    }

    expect(events[0]?.type).toBe("error");
    expect(events[0]?.error?.message).toBe("boom");
  });

  it("appends tool events passed via options", async () => {
    const parts = asAsyncIterable([]);
    const events: Array<{ type: string; toolCall?: object; toolResult?: object }> = [];

    for await (const event of toModelStreamEvents(parts, {
      toolCall: { id: "c3", name: "calc", arguments: { n: 1 } },
      toolResult: { toolCallId: "c3", name: "calc", result: 2 },
    })) {
      events.push({
        type: event.type,
        toolCall: "toolCall" in event ? event.toolCall : undefined,
        toolResult: "toolResult" in event ? event.toolResult : undefined,
      });
    }

    expect(events).toEqual([
      {
        type: "delta",
        toolCall: { id: "c3", name: "calc", arguments: { n: 1 } },
        toolResult: undefined,
      },
      {
        type: "delta",
        toolCall: undefined,
        toolResult: { toolCallId: "c3", name: "calc", result: 2 },
      },
    ]);
  });

  it("extracts tool call and tool result parts directly", () => {
    const toolCall = toToolCallFromPart(
      asAiSdkStreamPart({
        type: "tool-call",
        toolCallId: "c1",
        toolName: "lookup",
        input: { q: "hi" },
      }),
    );
    expect(toolCall).toEqual({ id: "c1", name: "lookup", arguments: { q: "hi" } });

    const toolResult = toToolResultFromPart(
      asAiSdkStreamPart({
        type: "tool-error",
        toolCallId: "c2",
        toolName: "fail",
        error: "boom",
      }),
    );
    expect(toolResult).toEqual({
      toolCallId: "c2",
      name: "fail",
      result: "boom",
      isError: true,
    });
  });
});
