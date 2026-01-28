import { describe, expect, it } from "bun:test";
import { createNluxChatAdapter } from "#adapters";
import type { EventStreamEvent } from "#adapters";
import type {
  InteractionEvent,
  InteractionEventMeta,
  InteractionHandle,
  InteractionHandleInput,
  InteractionHandleOverrides,
} from "#interaction";
import type { ModelStreamEvent } from "#adapters";
import type { ChatAdapterExtras, StreamingAdapterObserver } from "@nlux/core";

const baseMeta = (sequence: number, interactionId = "interaction-1"): InteractionEventMeta => ({
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

type ObserverCapture = {
  next: string[];
  completed: number;
  errors: Error[];
};

type RunCapture = {
  input?: InteractionHandleInput;
  overrides?: InteractionHandleOverrides;
  emitResult?: boolean | null | Promise<boolean | null>;
};

const createObserver = (capture: ObserverCapture): StreamingAdapterObserver<string> => ({
  next(value) {
    capture.next.push(value);
  },
  complete() {
    capture.completed += 1;
  },
  error(error) {
    capture.errors.push(error);
  },
});

type StreamTextInput = {
  adapter: {
    streamText?: (
      message: string,
      observer: StreamingAdapterObserver<string>,
      extras: ChatAdapterExtras<string>,
    ) => void;
  };
  message: string;
  observer: StreamingAdapterObserver<string>;
  extras: ChatAdapterExtras<string>;
};

const runStreamText = (input: StreamTextInput) => {
  if (!input.adapter.streamText) {
    throw new Error("Expected streamText to be defined.");
  }
  return input.adapter.streamText(input.message, input.observer, input.extras);
};

const createHandle = (capture: RunCapture, emitEvents?: InteractionEvent[]): InteractionHandle =>
  ({
    run(input: InteractionHandleInput, overrides?: InteractionHandleOverrides) {
      capture.input = input;
      capture.overrides = overrides;
      if (overrides?.eventStream && emitEvents) {
        for (const event of emitEvents) {
          overrides.eventStream.emit(toStreamEvent(event));
        }
      }
      return {
        state: {
          messages: [],
          diagnostics: [],
          trace: [],
        },
      };
    },
  }) as unknown as InteractionHandle;

const createExtras = (): ChatAdapterExtras<string> => ({
  aiChatProps: {},
  conversationHistory: [
    { role: "assistant", message: "history" },
    { role: "user", message: "follow-up" },
  ],
  contextId: "context-1",
});

describe("Adapter NLUX", () => {
  it("streams model deltas into observer callbacks", async () => {
    const capture: RunCapture = {};
    const observerCapture: ObserverCapture = { next: [], completed: 0, errors: [] };
    const events = [
      modelEvent(1, { type: "delta", text: "hello" }),
      modelEvent(2, { type: "end" }),
    ];
    const handle = createHandle(capture, events);
    const adapter = createNluxChatAdapter({ handle });

    await runStreamText({
      adapter,
      message: "hi",
      observer: createObserver(observerCapture),
      extras: createExtras(),
    });

    expect(observerCapture.next).toEqual(["hello"]);
    expect(observerCapture.completed).toBe(1);
    expect(observerCapture.errors).toEqual([]);
    expect(capture.input?.message?.role).toBe("user");
    expect(capture.input?.correlationId).toBe("context-1");
    expect(capture.input?.interactionId).toBeUndefined();
  });

  it("maps custom chunks and errors", async () => {
    const capture: RunCapture = {};
    const observerCapture: ObserverCapture = { next: [], completed: 0, errors: [] };
    const events = [
      modelEvent(1, { type: "delta", text: "ignored" }),
      modelEvent(2, { type: "error", error: "boom" }),
    ];
    const handle = createHandle(capture, events);
    const adapter = createNluxChatAdapter({
      handle,
      mapChunk: (event) =>
        event.kind === "model" && event.event.type === "delta" ? "mapped" : null,
    });

    await runStreamText({
      adapter,
      message: "hi",
      observer: createObserver(observerCapture),
      extras: createExtras(),
    });

    expect(observerCapture.next).toEqual(["mapped"]);
    expect(observerCapture.errors[0]?.message).toBe("boom");
  });

  it("returns null for non-interaction stream events", async () => {
    const capture: RunCapture = {};
    const observerCapture: ObserverCapture = { next: [], completed: 0, errors: [] };

    const handle: InteractionHandle = {
      run(input: InteractionHandleInput, overrides?: InteractionHandleOverrides) {
        capture.input = input;
        capture.overrides = overrides;
        capture.emitResult = overrides?.eventStream?.emit({ name: "trace.demo", data: null });
        return {
          state: {
            messages: [],
            diagnostics: [],
            trace: [],
          },
        };
      },
    } as unknown as InteractionHandle;

    const adapter = createNluxChatAdapter({ handle });

    await runStreamText({
      adapter,
      message: "hi",
      observer: createObserver(observerCapture),
      extras: createExtras(),
    });

    expect(capture.emitResult).toBeNull();
    expect(observerCapture.next).toEqual([]);
    expect(observerCapture.completed).toBe(0);
    expect(observerCapture.errors).toEqual([]);
  });

  it("aggregates emitMany results from the interaction stream", async () => {
    const capture: RunCapture = {};
    const observerCapture: ObserverCapture = { next: [], completed: 0, errors: [] };

    const handle: InteractionHandle = {
      run(input: InteractionHandleInput, overrides?: InteractionHandleOverrides) {
        capture.input = input;
        capture.overrides = overrides;
        const stream = overrides?.eventStream;
        capture.emitResult = stream?.emitMany
          ? stream.emitMany([
              toStreamEvent(modelEvent(1, { type: "delta", text: "hello" })),
              toStreamEvent(modelEvent(2, { type: "end" })),
            ])
          : null;
        return {
          state: {
            messages: [],
            diagnostics: [],
            trace: [],
          },
        };
      },
    } as unknown as InteractionHandle;

    const adapter = createNluxChatAdapter({ handle });

    await runStreamText({
      adapter,
      message: "hi",
      observer: createObserver(observerCapture),
      extras: createExtras(),
    });

    expect(capture.emitResult).toBe(true);
    expect(observerCapture.completed).toBe(1);
  });

  it("returns false when observer callbacks throw", async () => {
    const capture: RunCapture = {};
    const observer: StreamingAdapterObserver<string> = {
      next() {
        throw new Error("fail");
      },
      complete() {
        throw new Error("fail");
      },
      error() {
        throw new Error("fail");
      },
    };

    const handle: InteractionHandle = {
      run(input: InteractionHandleInput, overrides?: InteractionHandleOverrides) {
        capture.input = input;
        capture.overrides = overrides;
        const stream = overrides?.eventStream;
        capture.emitResult = stream?.emitMany
          ? stream.emitMany([
              toStreamEvent(modelEvent(1, { type: "delta", text: "oops" })),
              toStreamEvent(modelEvent(2, { type: "error", error: { ok: false } })),
            ])
          : null;
        return {
          state: {
            messages: [],
            diagnostics: [],
            trace: [],
          },
        };
      },
    } as unknown as InteractionHandle;

    const adapter = createNluxChatAdapter({ handle });

    await runStreamText({
      adapter,
      message: "hi",
      observer,
      extras: createExtras(),
    });

    expect(capture.emitResult).toBe(false);
  });

  it("returns the mapped result for batch text", async () => {
    const handle: InteractionHandle = {
      run() {
        return {
          state: {
            messages: [{ role: "assistant", content: "final" }],
            diagnostics: [],
            trace: [],
          },
        };
      },
    } as unknown as InteractionHandle;

    const adapter = createNluxChatAdapter({
      handle,
      mapResult: () => "mapped",
    });

    if (!adapter.batchText) {
      throw new Error("Expected batchText to be defined.");
    }
    const result = await adapter.batchText("hi", createExtras());

    expect(result).toBe("mapped");
  });

  it("reads the latest assistant text when no mapper is provided", async () => {
    const handle: InteractionHandle = {
      run() {
        return {
          state: {
            messages: [
              { role: "assistant", content: { text: "answer", parts: [] } },
              { role: "user", content: "question" },
            ],
            diagnostics: [],
            trace: [],
          },
        };
      },
    } as unknown as InteractionHandle;

    const adapter = createNluxChatAdapter({ handle });

    if (!adapter.batchText) {
      throw new Error("Expected batchText to be defined.");
    }
    const result = await adapter.batchText("hi", createExtras());

    expect(result).toBe("answer");
  });
});
