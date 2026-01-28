import { describe, expect, it } from "bun:test";
import {
  createStreamingModel,
  createStreamingModelForInteraction,
} from "../../src/workflow/stream";
import type {
  EventStream,
  EventStreamEvent,
  Model,
  ModelCall,
  ModelResult,
  ModelStreamEvent,
} from "../../src/adapters/types";
import type { InteractionEvent } from "../../src/interaction/types";
import { toSchema } from "../../src/adapters";

const createModelWithStream = (events: ModelStreamEvent[]): Model => ({
  generate: () => ({ text: "fallback" }),
  stream: () => events,
});

const createModelWithoutStream = (tracker: ModelCallTracker): Model => ({
  generate: (call) => {
    tracker.generate += 1;
    tracker.lastCall = call;
    return { text: "generated" };
  },
});

type ModelCallTracker = {
  generate: number;
  stream: number;
  lastCall: ModelCall | null;
};

const createModelCallTracker = (): ModelCallTracker => ({
  generate: 0,
  stream: 0,
  lastCall: null,
});

const createModelWithStreamTracker = (input: {
  events: ModelStreamEvent[];
  tracker: ModelCallTracker;
  generateResult?: ModelResult;
}): Model => ({
  generate: (call) => {
    input.tracker.generate += 1;
    input.tracker.lastCall = call;
    return input.generateResult ?? { text: "generated" };
  },
  stream: (_call) => {
    input.tracker.stream += 1;
    return input.events;
  },
});

const createSequence = () => {
  let value = 0;
  return () => {
    value += 1;
    return value;
  };
};

describe("workflow streaming model", () => {
  it("emits interaction model events while streaming", async () => {
    const recorder = createInteractionEventRecorder();
    const model = createModelWithStream([
      { type: "start" },
      { type: "delta", text: "hello" },
      { type: "end" },
    ]);

    const streamingModel = createStreamingModel({
      model,
      eventStream: recorder.stream,
      interactionId: "chat-1",
      correlationId: "req-1",
      nextSequence: createSequence(),
      nextSourceId: createSourceId("recipe"),
    });

    const result = await streamingModel.generate({ prompt: "hi" });

    expect(result.text).toBe("hello");
    expect(recorder.events.length).toBe(3);
    expect(recorder.events[0]?.kind).toBe("model");
  });

  it("falls back to generate when response schema is present", async () => {
    const tracker = createModelCallTracker();
    const recorder = createInteractionEventRecorder();
    const model = createModelWithStreamTracker({
      tracker,
      events: [{ type: "error", error: new Error("streaming_unsupported") }],
      generateResult: { text: "generated" },
    });

    const streamingModel = createStreamingModel({
      model,
      eventStream: recorder.stream,
      interactionId: "chat-1",
      correlationId: "req-2",
      nextSequence: createSequence(),
      nextSourceId: createSourceId("recipe"),
    });

    const result = await streamingModel.generate({
      prompt: "hi",
      responseSchema: toSchema({ type: "object", properties: {} }),
    });

    expect(result.text).toBe("generated");
    expect(tracker.generate).toBe(1);
    expect(tracker.stream).toBe(0);
  });

  it("streams model events when stream is requested", () => {
    const recorder = createInteractionEventRecorder();
    const model = createModelWithStream([{ type: "start" }, { type: "end" }]);

    const streamingModel = createStreamingModel({
      model,
      eventStream: recorder.stream,
      interactionId: "chat-1",
      correlationId: "req-1",
      nextSequence: createSequence(),
      nextSourceId: createSourceId("recipe"),
    });

    const iterable = streamingModel.stream?.({ prompt: "hi" });
    expect(iterable).not.toBeUndefined();
    const events = Array.from(iterable as Iterable<ModelStreamEvent>);

    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe("start");
  });

  it("falls back to generate when the model has no stream", async () => {
    const tracker = createModelCallTracker();
    const recorder = createInteractionEventRecorder();
    const model = createModelWithoutStream(tracker);

    const streamingModel = createStreamingModel({
      model,
      eventStream: recorder.stream,
      interactionId: "chat-1",
      correlationId: "req-2",
      nextSequence: createSequence(),
      nextSourceId: createSourceId("recipe"),
    });

    const result = await streamingModel.generate({ prompt: "hi" });

    expect(result.text).toBe("generated");
    expect(tracker.generate).toBe(1);
  });

  it("preserves reasoning from stream events", async () => {
    const recorder = createInteractionEventRecorder();
    const model = createModelWithStream([
      { type: "start" },
      { type: "delta", text: "hello", reasoning: "think" },
      { type: "end" },
    ]);

    const streamingModel = createStreamingModel({
      model,
      eventStream: recorder.stream,
      interactionId: "chat-2",
      correlationId: "req-3",
      nextSequence: createSequence(),
      nextSourceId: createSourceId("recipe"),
    });

    const result = await streamingModel.generate({ prompt: "hi" });

    expect(result.text).toBe("hello");
    expect(result.reasoning).toBe("think");
  });

  it("collects tool calls, tool results, usage, and end text", async () => {
    const recorder = createInteractionEventRecorder();
    const model = createModelWithStream([
      { type: "start" },
      {
        type: "delta",
        text: "Hello",
        toolCall: { id: "tool-1", name: "search", arguments: { q: "hi" } },
      },
      {
        type: "delta",
        toolResult: { toolCallId: "tool-1", name: "search", result: { ok: true } },
      },
      { type: "usage", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } },
      { type: "end", text: "!" },
    ]);

    const streamingModel = createStreamingModel({
      model,
      eventStream: recorder.stream,
      interactionId: "chat-3",
      correlationId: "req-4",
      nextSequence: createSequence(),
      nextSourceId: createSourceId("recipe"),
    });

    const result = await streamingModel.generate({ prompt: "hi" });

    expect(result.text).toBe("Hello!");
    expect(result.toolCalls?.length).toBe(1);
    expect(result.toolResults?.length).toBe(1);
    expect(result.usage?.totalTokens).toBe(3);
  });

  it("uses sourceId prefixes for interaction streams", async () => {
    const recorder = createInteractionEventRecorder();
    const model = createModelWithStream([{ type: "delta", text: "Hello" }]);

    const streamingModel = createStreamingModelForInteraction({
      model,
      eventStream: recorder.stream,
      interactionId: "chat-4",
      correlationId: "req-5",
      sourceIdPrefix: "custom",
    });

    await streamingModel.generate({ prompt: "hi" });

    expect(recorder.events[0]?.meta.sourceId).toBe("custom.model.1");
  });

  it("emits errors from stream events", async () => {
    const recorder = createInteractionEventRecorder();
    const model = createModelWithStream([{ type: "error", error: new Error("boom") }]);

    const streamingModel = createStreamingModel({
      model,
      eventStream: recorder.stream,
      interactionId: "chat-5",
      correlationId: "req-6",
      nextSequence: createSequence(),
      nextSourceId: createSourceId("recipe"),
    });

    await expect(streamingModel.generate({ prompt: "hi" })).rejects.toThrow("boom");
    expect(recorder.events.length).toBe(1);
  });
});

type InteractionEventRecorder = {
  events: InteractionEvent[];
  stream: EventStream;
};

const createInteractionEventRecorder = (): InteractionEventRecorder => {
  const events: InteractionEvent[] = [];
  const stream: EventStream = {
    emit: (event) => {
      const payload = readInteractionEvent(event);
      if (payload) {
        events.push(payload);
      }
      return true;
    },
    emitMany: (items) => {
      for (const event of items) {
        const payload = readInteractionEvent(event);
        if (payload) {
          events.push(payload);
        }
      }
      return true;
    },
  };
  return { events, stream };
};

const readInteractionEvent = (event: EventStreamEvent) => {
  const data = event.data;
  if (!data || typeof data !== "object" || !("event" in data)) {
    return null;
  }
  const payload = (data as { event?: InteractionEvent }).event;
  return payload ?? null;
};

const createSourceId = (prefix: string) => {
  const next = createSequence();
  return () => `${prefix}.model.${next()}`;
};
