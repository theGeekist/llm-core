import { describe, expect, it } from "bun:test";
import {
  createAiSdkInteractionEventStream,
  createAiSdkInteractionMapper,
  createAiSdkInteractionSink,
  toAiSdkUiMessageChunks,
} from "#adapters";
import type { ModelStreamEvent } from "#adapters";
import type { InteractionEvent, InteractionEventMeta } from "#interaction";
import type { EventStreamEvent } from "#adapters";

const baseMeta = (sequence: number, interactionId = "interaction-1"): InteractionEventMeta => ({
  sequence,
  timestamp: 0,
  sourceId: "source-1",
  interactionId,
});

const modelEvent = (
  sequence: number,
  event: ModelStreamEvent,
  interactionId?: string,
): InteractionEvent => ({
  kind: "model",
  event,
  meta: baseMeta(sequence, interactionId),
});

const traceEvent = (sequence: number): InteractionEvent => ({
  kind: "trace",
  event: { kind: "trace", at: "now", data: { ok: true } },
  meta: baseMeta(sequence),
});

const diagnosticEvent = (sequence: number): InteractionEvent => ({
  kind: "diagnostic",
  entry: { level: "error", kind: "adapter", message: "boom" },
  meta: baseMeta(sequence),
});

const toStreamEvent = (event: InteractionEvent): EventStreamEvent => ({
  name: `interaction.${event.kind}`,
  data: { event },
});

type Chunk = { type: string; [key: string]: unknown };
type ChunkCapture = { chunks: Chunk[] };

const createChunkCapture = (): ChunkCapture => ({ chunks: [] });

const appendChunk = (capture: ChunkCapture, chunk: Chunk) => {
  capture.chunks.push(chunk);
};

const createWriter = (capture: ChunkCapture) => ({
  write(chunk: Chunk) {
    appendChunk(capture, chunk);
  },
  merge() {},
  onError: undefined,
});

describe("Adapter AI SDK UI mapping", () => {
  it("maps model events into UI message chunks", () => {
    const mapper = createAiSdkInteractionMapper({ messageId: "m1" });

    const events = [
      modelEvent(1, { type: "start", id: "m1" }),
      modelEvent(2, { type: "delta", text: "hello" }),
      modelEvent(3, { type: "end", finishReason: "stop" }),
    ];

    const chunks = events.flatMap((event) => mapper.mapEvent(event));

    expect(chunks).toEqual([
      { type: "start", messageId: "m1" },
      { type: "text-start", id: "m1:text" },
      { type: "text-delta", id: "m1:text", delta: "hello" },
      { type: "text-end", id: "m1:text" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("maps tool events into tool chunks", () => {
    const mapper = createAiSdkInteractionMapper({ messageId: "m2" });

    const events = [
      modelEvent(1, {
        type: "delta",
        toolCall: { id: "call-1", name: "lookup", arguments: { q: "hi" } },
      }),
      modelEvent(2, {
        type: "delta",
        toolResult: { toolCallId: "call-1", name: "lookup", result: { ok: true } },
      }),
      modelEvent(3, {
        type: "delta",
        toolResult: { toolCallId: "call-2", name: "fail", result: "boom", isError: true },
      }),
    ];

    const chunks = events.flatMap((event) => mapper.mapEvent(event));

    expect(chunks).toEqual([
      {
        type: "tool-input-available",
        toolCallId: "call-1",
        toolName: "lookup",
        input: { q: "hi" },
      },
      {
        type: "tool-output-available",
        toolCallId: "call-1",
        output: { ok: true },
      },
      {
        type: "tool-output-error",
        toolCallId: "call-2",
        errorText: "boom",
      },
    ]);
  });

  it("maps trace and diagnostic events into data chunks", () => {
    const mapper = createAiSdkInteractionMapper({ dataIdPrefix: "capture" });

    const chunks = [traceEvent(1), diagnosticEvent(2)].flatMap((event) => mapper.mapEvent(event));

    expect(chunks).toEqual([
      {
        type: "data-trace",
        data: { kind: "trace", at: "now", data: { ok: true } },
        id: "capture:1",
        transient: true,
      },
      {
        type: "data-diagnostic",
        data: { level: "error", kind: "adapter", message: "boom" },
        id: "capture:2",
        transient: true,
      },
    ]);
  });

  it("resets messageId across interactions when no explicit id is set", () => {
    const mapper = createAiSdkInteractionMapper();

    const first = mapper.mapEvent(modelEvent(1, { type: "start", id: "m1" }, "one"));
    const second = mapper.mapEvent(modelEvent(1, { type: "start", id: "m2" }, "two"));

    expect(first).toEqual([{ type: "start", messageId: "m1" }]);
    expect(second).toEqual([{ type: "start", messageId: "m2" }]);
  });

  it("supports stateless helper usage with a shared mapper", () => {
    const mapper = createAiSdkInteractionMapper();

    const deltaChunks = toAiSdkUiMessageChunks(
      mapper,
      modelEvent(1, { type: "delta", text: "hi" }),
    );
    const endChunks = toAiSdkUiMessageChunks(
      mapper,
      modelEvent(2, { type: "end", finishReason: "stop" }),
    );

    expect(deltaChunks).toEqual([
      { type: "text-start", id: "interaction-1:text" },
      { type: "text-delta", id: "interaction-1:text", delta: "hi" },
    ]);
    expect(endChunks).toEqual([
      { type: "text-end", id: "interaction-1:text" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("closes active parts on error events", () => {
    const mapper = createAiSdkInteractionMapper();

    const deltaChunks = mapper.mapEvent(modelEvent(1, { type: "delta", text: "hi" }));
    const errorChunks = mapper.mapEvent(modelEvent(2, { type: "error", error: "boom" }));

    expect(deltaChunks).toEqual([
      { type: "text-start", id: "interaction-1:text" },
      { type: "text-delta", id: "interaction-1:text", delta: "hi" },
    ]);
    expect(errorChunks).toEqual([
      { type: "text-end", id: "interaction-1:text" },
      { type: "error", errorText: "boom" },
      { type: "finish", finishReason: "error" },
    ]);
  });

  it("streams interaction events through the AI SDK event stream adapter", () => {
    const capture = createChunkCapture();
    const writer = createWriter(capture);
    const stream = createAiSdkInteractionEventStream({ writer });

    const event = modelEvent(1, { type: "delta", text: "hello" });
    const result = stream.emit(toStreamEvent(event));

    expect(result).toBe(true);
    expect(capture.chunks).toEqual([
      { type: "text-start", id: "interaction-1:text" },
      { type: "text-delta", id: "interaction-1:text", delta: "hello" },
    ]);
  });

  it("writes chunks with the interaction sink", () => {
    const capture = createChunkCapture();
    const writer = createWriter(capture);
    const sink = createAiSdkInteractionSink({ writer });

    sink.onEvent(modelEvent(1, { type: "delta", reasoning: "thinking" }));

    expect(capture.chunks).toEqual([
      { type: "reasoning-start", id: "interaction-1:reasoning" },
      { type: "reasoning-delta", id: "interaction-1:reasoning", delta: "thinking" },
    ]);
  });
});
