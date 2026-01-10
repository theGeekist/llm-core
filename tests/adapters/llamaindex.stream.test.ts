import { describe, expect, it } from "bun:test";
import type { ChatResponseChunk, ToolCall as LlamaToolCall } from "@llamaindex/core/llms";
import type { AdapterDiagnostic, ModelStreamEvent } from "#adapters";
import { toLlamaIndexStreamEvents } from "../../src/adapters/llamaindex";
import { readToolEvents } from "#adapters/llamaindex/stream";
import { readUsagePayload, toUsage } from "#adapters/llamaindex/model-utils";

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

  it("reads usage payloads from raw chunks", () => {
    const usage = readUsagePayload({ usage: { input_tokens: 1 } });
    expect(usage).toEqual({ input_tokens: 1 });
  });

  it("maps usage payloads into model usage", () => {
    const usage = toUsage({ usage: { output_tokens: 2 } });
    expect(usage).toEqual({ inputTokens: null, outputTokens: 2, totalTokens: null });
  });

  it("maps tool calls into delta events", () => {
    const events = readToolEvents([{ id: "tool-1", name: "search", input: {} }]);
    expect(events[0]).toEqual(
      expect.objectContaining({
        type: "delta",
        toolCall: { id: "tool-1", name: "search", arguments: {} },
      }),
    );
  });
});
