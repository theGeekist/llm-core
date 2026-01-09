import { describe, expect, it } from "bun:test";
import {
  createChatKitInteractionEventStream,
  createChatKitInteractionMapper,
  createChatKitInteractionSink,
  toChatKitEvents,
  toChatKitThreadId,
} from "#adapters";
import type { ModelStreamEvent } from "#adapters";
import type { InteractionEvent, InteractionEventMeta } from "#interaction";
import type { EventStreamEvent } from "#adapters";

const baseMeta = (sequence: number, interactionId = "thread-1"): InteractionEventMeta => ({
  sequence,
  timestamp: 0,
  sourceId: "source-1",
  interactionId,
});

const modelEvent = (sequence: number, event: ModelStreamEvent): InteractionEvent => ({
  kind: "model",
  event,
  meta: baseMeta(sequence),
});

const toStreamEvent = (event: InteractionEvent): EventStreamEvent => ({
  name: `interaction.${event.kind}`,
  data: { event },
});

type EventCapture = { events: CustomEvent[] };

const createCapture = (): EventCapture => ({ events: [] });

const dispatchEvent = (capture: EventCapture, event: CustomEvent) => {
  capture.events.push(event);
};

describe("Adapter openai-chatkit mapping", () => {
  it("maps model start/end to response events", () => {
    const mapper = createChatKitInteractionMapper();

    const commands = [
      modelEvent(1, { type: "start", id: "m1" }),
      modelEvent(2, { type: "end", finishReason: "stop" }),
    ].flatMap((event) => mapper.mapEvent(event));

    expect(commands.map((event) => event.type)).toEqual([
      "chatkit.response.start",
      "chatkit.response.end",
    ]);
  });

  it("maps model errors to chatkit.error and response end", () => {
    const mapper = createChatKitInteractionMapper();
    const error = "bad";

    const events = mapper.mapEvent(modelEvent(1, { type: "error", error }));

    expect(events.map((event) => event.type)).toEqual(["chatkit.error", "chatkit.response.end"]);
    const detail = events[0]?.detail as { error?: Error } | undefined;
    expect(detail?.error).toBeInstanceOf(Error);
  });

  it("logs non-model events by default", () => {
    const mapper = createChatKitInteractionMapper();
    const event: InteractionEvent = {
      kind: "diagnostic",
      entry: { level: "warn", kind: "adapter", message: "warn" },
      meta: baseMeta(1),
    };

    const events = mapper.mapEvent(event);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("chatkit.log");
    const detail = events[0]?.detail as { name?: string } | undefined;
    expect(detail?.name).toBe("interaction.diagnostic");
  });

  it("logs model events when enabled", () => {
    const mapper = createChatKitInteractionMapper({ logModelEvents: true });

    const events = mapper.mapEvent(modelEvent(1, { type: "delta", text: "hello" }));

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("chatkit.log");
  });

  it("supports event stream mapping", () => {
    const capture = createCapture();
    const stream = createChatKitInteractionEventStream({
      dispatchEvent: (event) => dispatchEvent(capture, event),
    });

    stream.emit(toStreamEvent(modelEvent(1, { type: "start", id: "m1" })));
    stream.emitMany!([
      { name: "interaction.model", data: null },
      toStreamEvent(modelEvent(2, { type: "end", finishReason: "stop" })),
    ]);

    expect(capture.events.map((event) => event.type)).toEqual([
      "chatkit.response.start",
      "chatkit.response.end",
    ]);
  });

  it("returns false when dispatch throws", () => {
    const stream = createChatKitInteractionEventStream({
      dispatchEvent: () => {
        throw new Error("fail");
      },
    });

    const result = stream.emit(toStreamEvent(modelEvent(1, { type: "start", id: "m1" })));

    expect(result).toBe(false);
  });

  it("writes commands through the chatkit sink", () => {
    const capture = createCapture();
    const sink = createChatKitInteractionSink({
      dispatchEvent: (event) => dispatchEvent(capture, event),
    });

    sink.onEvent(modelEvent(1, { type: "start", id: "m1" }));
    sink.onEvent(modelEvent(2, { type: "end", finishReason: "stop" }));

    expect(capture.events.map((event) => event.type)).toEqual([
      "chatkit.response.start",
      "chatkit.response.end",
    ]);
  });

  it("supports helper usage with mapper options", () => {
    const events = toChatKitEvents(
      { logEventName: "chatkit.effect" },
      modelEvent(1, { type: "delta", text: "hello" }),
    );

    expect(events).toEqual([]);
  });

  it("derives thread ids from interaction metadata", () => {
    const meta = baseMeta(1, "thread-42");

    const threadId = toChatKitThreadId(meta, "fallback");

    expect(threadId).toBe("thread-42");
  });
});
