import { describe, expect, it } from "bun:test";
import type { UIMessage, UIMessageChunk } from "ai";
import { createAiSdkChatTransport } from "#adapters";
import type {
  InteractionEvent,
  InteractionEventMeta,
  InteractionHandle,
  InteractionHandleInput,
  InteractionHandleOverrides,
} from "#interaction";
import type { EventStreamEvent, Message } from "#adapters";

type RunCapture = {
  input?: InteractionHandleInput;
  overrides?: InteractionHandleOverrides;
};

type StreamResult = {
  chunks: UIMessageChunk[];
};

const baseMeta = (sequence: number, interactionId = "interaction-1"): InteractionEventMeta => ({
  sequence,
  timestamp: 0,
  sourceId: "source-1",
  interactionId,
});

const modelEvent = (
  sequence: number,
  event: { type: "start" | "delta" | "end"; text?: string; id?: string },
): InteractionEvent => ({
  kind: "model",
  event,
  meta: baseMeta(sequence),
});

const toStreamEvent = (event: InteractionEvent): EventStreamEvent => ({
  name: `interaction.${event.kind}`,
  data: { event },
});

const makeUiMessage = (id: string, role: UIMessage["role"], text: string): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

const readStream = async (stream: ReadableStream<UIMessageChunk>): Promise<StreamResult> => {
  const reader = stream.getReader();
  const chunks: UIMessageChunk[] = [];
  try {
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done === true;
      if (result.value) {
        chunks.push(result.value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { chunks };
};

const createHandle = (capture: RunCapture, events?: InteractionEvent[]): InteractionHandle =>
  ({
    run(input: InteractionHandleInput, overrides?: InteractionHandleOverrides) {
      capture.input = input;
      capture.overrides = overrides;
      if (overrides?.eventStream && events) {
        for (const event of events) {
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

const mapMessages = (messages: UIMessage[]): Message[] => {
  if (messages.length === 0) {
    return [];
  }
  return [
    { role: "assistant", content: "history" },
    { role: "user", content: "next" },
  ];
};

describe("Adapter AI SDK chat transport", () => {
  it("maps UI messages into interaction inputs by default", async () => {
    const capture: RunCapture = {};
    const events = [
      modelEvent(1, { type: "start", id: "m1" }),
      modelEvent(2, { type: "delta", text: "hello" }),
      modelEvent(3, { type: "end" }),
    ];
    const handle = createHandle(capture, events);
    const transport = createAiSdkChatTransport({ handle, captureEvents: true });

    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [makeUiMessage("m1", "assistant", "hi"), makeUiMessage("m2", "user", "yo")],
      abortSignal: undefined,
    });

    const result = await readStream(stream);

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(capture.input?.message?.role).toBe("user");
    expect(capture.input?.state?.messages.length).toBe(1);
    expect(capture.input?.interactionId).toBe("chat-1");
    expect(capture.input?.correlationId).toBe("chat-1");
    expect(capture.overrides?.captureEvents).toBe(true);
  });

  it("honors explicit message mapping and id functions", async () => {
    const capture: RunCapture = {};
    const handle = createHandle(capture);
    const transport = createAiSdkChatTransport({
      handle,
      mapMessages,
      interactionId: (chatId) => `interaction:${chatId}`,
      correlationId: (chatId) => `correlation:${chatId}`,
    });

    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-2",
      messageId: undefined,
      messages: [makeUiMessage("m1", "user", "hello")],
      abortSignal: undefined,
    });

    await readStream(stream);

    expect(capture.input?.state?.messages.length).toBe(1);
    expect(capture.input?.message?.role).toBe("user");
    expect(capture.input?.interactionId).toBe("interaction:chat-2");
    expect(capture.input?.correlationId).toBe("correlation:chat-2");
  });

  it("handles mapped histories without user input", async () => {
    const capture: RunCapture = {};
    const handle = createHandle(capture);
    const transport = createAiSdkChatTransport({
      handle,
      mapMessages: () => [{ role: "assistant", content: "history" }],
    });

    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-3",
      messageId: undefined,
      messages: [makeUiMessage("m1", "assistant", "hi")],
      abortSignal: undefined,
    });

    await readStream(stream);

    expect(capture.input?.message).toBeUndefined();
    expect(capture.input?.state?.messages.length).toBe(1);
  });

  it("accepts custom mappers and reconnects with null streams", async () => {
    const capture: RunCapture = {};
    const mapperCalls: string[] = [];
    const mapper = {
      mapEvent(event: InteractionEvent) {
        mapperCalls.push(event.kind);
        return [];
      },
      reset() {},
    };
    const events = [modelEvent(1, { type: "delta", text: "hello" })];
    const handle = createHandle(capture, events);
    const transport = createAiSdkChatTransport({ handle, mapper });

    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-4",
      messageId: undefined,
      messages: [makeUiMessage("m1", "user", "hello")],
      abortSignal: undefined,
    });

    await readStream(stream);

    const reconnect = await transport.reconnectToStream();

    expect(mapperCalls).toEqual(["model"]);
    expect(reconnect).toBeNull();
  });
});
