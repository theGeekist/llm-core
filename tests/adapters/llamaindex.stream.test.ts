import { describe, expect, it } from "bun:test";
import type { ChatResponseChunk, ToolCall as LlamaToolCall } from "@llamaindex/core/llms";
import type { AdapterDiagnostic, ModelStreamEvent } from "#adapters";
import { toLlamaIndexStreamEvents } from "#adapters/llamaindex";

const collectEvents = async (events: AsyncIterable<ModelStreamEvent>) => {
  const collected: ModelStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
};

async function* streamChunks() {
  const chunk: ChatResponseChunk = {
    delta: "Hello",
    raw: { usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } },
  };
  yield chunk;
}

const toolCalls: LlamaToolCall[] = [{ id: "tool-1", name: "search", input: { q: "hi" } }];

describe("Adapter LlamaIndex streaming", () => {
  it("maps chunks into stream events with tool calls", async () => {
    const events = await collectEvents(toLlamaIndexStreamEvents(streamChunks(), { toolCalls }));
    expect(events[0]?.type).toBe("start");
    expect(events[1]).toEqual(expect.objectContaining({ type: "delta", text: "Hello" }));
    expect(events[2]).toEqual(
      expect.objectContaining({
        type: "usage",
        usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      }),
    );
    expect(events[3]).toEqual(
      expect.objectContaining({
        type: "delta",
        toolCall: { id: "tool-1", name: "search", arguments: { q: "hi" } },
      }),
    );
    expect(events.at(-1)).toEqual(expect.objectContaining({ type: "end" }));
  });

  it("adds usage diagnostics when none are emitted", async () => {
    async function* chunksWithoutUsage() {
      const chunk: ChatResponseChunk = { delta: "Hello", raw: {} };
      yield chunk;
    }

    const diagnostics: AdapterDiagnostic[] = [];
    const events = await collectEvents(
      toLlamaIndexStreamEvents(chunksWithoutUsage(), { diagnostics }),
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
