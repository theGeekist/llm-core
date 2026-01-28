import { describe, expect, it } from "bun:test";
import { createAiSdkInteractionMapper } from "#adapters";
import type { InteractionEvent, InteractionEventMeta } from "#interaction";
import type { ModelStreamEvent } from "#adapters";

const meta: InteractionEventMeta = {
  sequence: 1,
  timestamp: 0,
  sourceId: "model-1",
};

const withMeta = (event: InteractionEvent): InteractionEvent => ({
  ...event,
  meta: event.meta ?? meta,
});

const toModelEvent = (event: ModelStreamEvent): InteractionEvent => ({
  kind: "model",
  event,
  meta,
});

describe("Adapter AI SDK UI mapper", () => {
  it("emits a start chunk when a delta arrives first", () => {
    const mapper = createAiSdkInteractionMapper();
    const chunks = mapper.mapEvent(toModelEvent({ type: "delta", text: "hello" }));

    expect(chunks.map((chunk) => chunk.type)).toEqual(["start", "text-start", "text-delta"]);
  });

  it("closes text on end events", () => {
    const mapper = createAiSdkInteractionMapper();
    mapper.mapEvent(toModelEvent({ type: "delta", text: "hello" }));

    const chunks = mapper.mapEvent(toModelEvent({ type: "end", finishReason: "stop" }));

    expect(chunks.map((chunk) => chunk.type)).toEqual(["text-end", "finish"]);
  });

  it("emits start before tool events", () => {
    const mapper = createAiSdkInteractionMapper();
    const chunks = mapper.mapEvent(
      toModelEvent({
        type: "delta",
        toolCall: { id: "tool-1", name: "lookup", arguments: { q: "hi" } },
      }),
    );

    expect(chunks.map((chunk) => chunk.type)).toEqual(["start", "tool-input-available"]);
  });

  it("passes through non-model events as data chunks", () => {
    const mapper = createAiSdkInteractionMapper();
    const traceEvent = withMeta({
      kind: "trace",
      event: { kind: "trace.demo", at: "now", data: { ok: true } },
      meta,
    });

    const chunks = mapper.mapEvent(traceEvent);

    expect(chunks[0]?.type).toBe("data-trace");
  });
});
