import { describe, expect, it } from "bun:test";
import { AIMessageChunk, ToolMessageChunk } from "@langchain/core/messages";
import type { AdapterDiagnostic, ModelStreamEvent } from "#adapters";
import { toLangChainStreamEvents } from "#adapters/langchain";

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
});

const findToolResultEvent = (events: ModelStreamEvent[]) =>
  events.find((event) => event.type === "delta" && "toolResult" in event);
