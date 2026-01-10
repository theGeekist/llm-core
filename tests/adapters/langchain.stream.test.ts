import { describe, expect, it } from "bun:test";
import { AIMessageChunk, ToolMessageChunk } from "@langchain/core/messages";
import type { AdapterDiagnostic, ModelStreamEvent } from "#adapters";
import { toLangChainStreamEvents } from "../../src/adapters/langchain";
import {
  isToolChunk,
  readChunkType,
  readStreamMeta,
  readTextDelta,
  readToolCalls,
  readToolResult,
} from "../../src/adapters/langchain/stream-utils";

const collectEvents = async (events: AsyncIterable<ModelStreamEvent>) => {
  const collected: ModelStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
};

async function* streamChunks() {
  yield new AIMessageChunk({
    content: "Hello",
    tool_calls: [{ id: "tool-1", name: "search", args: { q: "hi" } }],
    usage_metadata: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    response_metadata: { id: "req-1", model: "demo", created: 1 },
  });
  yield new ToolMessageChunk({
    content: "Result",
    tool_call_id: "tool-1",
    status: "success",
  });
}

const makeChunkWithMeta = (meta: Record<string, unknown>) =>
  new AIMessageChunk({
    content: "",
    response_metadata: meta,
  });

describe("Adapter LangChain streaming", () => {
  it("maps chunks into stream events with tool calls and results", async () => {
    const events = await collectEvents(toLangChainStreamEvents(streamChunks()));
    expect(events[0]?.type).toBe("start");
    expect(events[1]).toEqual(expect.objectContaining({ type: "delta", text: "Hello" }));
    expect(events[2]).toEqual(
      expect.objectContaining({
        type: "delta",
        toolCall: { id: "tool-1", name: "search", arguments: { q: "hi" } },
      }),
    );
    expect(events[3]).toEqual(
      expect.objectContaining({
        type: "usage",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      }),
    );
    const toolResultEvent = findToolResultEvent(events);
    expect(toolResultEvent).toEqual(
      expect.objectContaining({
        type: "delta",
        toolResult: { toolCallId: "tool-1", name: "tool", result: "Result", isError: false },
      }),
    );
    expect(events.at(-1)).toEqual(expect.objectContaining({ type: "end" }));
  });

  it("adds usage diagnostics when none are emitted", async () => {
    async function* chunksWithoutUsage() {
      yield new AIMessageChunk({ content: "Hello" });
    }

    const diagnostics: AdapterDiagnostic[] = [];
    const events = await collectEvents(
      toLangChainStreamEvents(chunksWithoutUsage(), { diagnostics }),
    );

    expect(diagnostics.map((entry) => entry.message)).toContain("usage_unavailable");
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: "end",
        diagnostics,
      }),
    );
  });

  it("reads text deltas from structured chunks", () => {
    const chunk = new AIMessageChunk({
      content: [
        { type: "text", text: "hi " },
        { type: "text", text: "there" },
      ],
    });
    const text = readTextDelta(chunk);
    expect(text).toBe("hi there");
  });

  it("reads tool calls from tool call chunks", () => {
    const chunk = new AIMessageChunk({
      content: "",
      tool_call_chunks: [{ id: "tool-1", name: "search", args: '{"q":"hi"}' }],
    });
    const calls = readToolCalls(chunk);
    expect(calls[0]).toEqual({
      id: "tool-1",
      name: "search",
      arguments: { q: "hi" },
    });
  });

  it("reads tool calls from tool_calls arrays", () => {
    const chunk = new AIMessageChunk({
      content: "",
      tool_calls: [{ id: "tool-1", name: "search", args: { q: "hi" } }],
    });
    const calls = readToolCalls(chunk);
    expect(calls[0]).toEqual({
      id: "tool-1",
      name: "search",
      arguments: { q: "hi" },
    });
  });

  it("drops tool call chunks without names and handles invalid json args", () => {
    const chunk = new AIMessageChunk({
      content: "",
      tool_call_chunks: [{ id: "tool-1", name: "search", args: "{bad" }, { id: "tool-2" }],
    });
    const calls = readToolCalls(chunk);
    expect(calls).toEqual([{ id: "tool-1", name: "search", arguments: {} }]);
  });

  it("handles invalid json tool call args as empty objects", () => {
    const chunk = new AIMessageChunk({
      content: "",
      tool_call_chunks: [{ id: "tool-1", name: "search", args: "{bad" }],
    });
    const calls = readToolCalls(chunk);
    expect(calls[0]).toEqual({ id: "tool-1", name: "search", arguments: {} });
  });

  it("reads tool results from tool message chunks", () => {
    const chunk = new ToolMessageChunk({
      content: "bad",
      tool_call_id: "tool-1",
      status: "error",
    });
    const result = readToolResult(chunk);
    expect(result).toEqual({
      toolCallId: "tool-1",
      name: "tool",
      result: "bad",
      isError: true,
    });
  });

  it("reads stream metadata when present", () => {
    const meta = readStreamMeta(makeChunkWithMeta({ created: 1, model: "gpt" }));
    expect(meta?.timestamp).toBe(1000);
    expect(meta?.modelId).toBe("gpt");
  });

  it("keeps millisecond timestamps when already large", () => {
    const meta = readStreamMeta(
      makeChunkWithMeta({ created: 1_700_000_000_000, request_id: "r1" }),
    );
    expect(meta?.timestamp).toBe(1_700_000_000_000);
    expect(meta?.id).toBe("r1");
  });

  it("returns null metadata when missing", () => {
    const meta = readStreamMeta(new AIMessageChunk({ content: "" }));
    expect(meta).toBeNull();
  });

  it("returns null metadata when no fields are present", () => {
    const meta = readStreamMeta(makeChunkWithMeta({}));
    expect(meta).toBeNull();
  });

  it("reads chunk type via _getType when available", () => {
    const chunk = { _getType: () => "tool" } as unknown as AIMessageChunk;
    expect(readChunkType(chunk)).toBe("tool");
  });

  it("returns false for non-tool chunks", () => {
    const chunk = new AIMessageChunk({ content: "hi" });
    expect(isToolChunk(chunk)).toBe(false);
  });

  it("reads empty text deltas for unsupported content", () => {
    const chunk = new AIMessageChunk({ content: "" });
    (chunk as { content: unknown }).content = { other: true };
    expect(readTextDelta(chunk)).toBe("");
  });

  it("returns empty strings for invalid text parts", () => {
    const chunk = new AIMessageChunk({ content: "" });
    (chunk as { content: unknown }).content = [{ type: "text", text: 2 }];
    expect(readTextDelta(chunk)).toBe("");
  });
});

const findToolResultEvent = (events: ModelStreamEvent[]) =>
  events.find((event) => event.type === "delta" && "toolResult" in event);
