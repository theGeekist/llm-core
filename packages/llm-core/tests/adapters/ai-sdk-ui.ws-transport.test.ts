import { beforeEach, afterEach, describe, expect, it } from "bun:test";
import type { UIMessage, UIMessageChunk } from "ai";
import {
  createAiSdkWebSocketChatTransport,
  type TransportEvent,
} from "../../src/adapters/ai-sdk-ui";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: FakeWebSocket[] = [];

  url: string;
  readyState: number;
  sent: string[];
  closed: boolean;
  listeners: Map<string, Array<(event: { data?: string }) => void>>;

  constructor(url: string) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    this.closed = false;
    this.listeners = new Map();
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    const group = this.listeners.get(type) ?? [];
    group.push(listener);
    this.listeners.set(type, group);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.closed = true;
  }

  trigger(type: string, data?: string) {
    if (type === "open") {
      this.readyState = FakeWebSocket.OPEN;
    }
    if (type === "close") {
      this.readyState = FakeWebSocket.CLOSED;
    }
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener({ data });
    }
  }

  static reset() {
    FakeWebSocket.instances.length = 0;
  }

  static latest(): FakeWebSocket | null {
    return FakeWebSocket.instances.at(-1) ?? null;
  }
}

const originalWebSocket = globalThis.WebSocket;
const originalCrypto = globalThis.crypto;

const installFakeWebSocket = () => {
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket as unknown as typeof WebSocket;
};

const restoreWebSocket = () => {
  (globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket;
};

let uuidCounter = 0;
const installFakeCrypto = () => {
  uuidCounter = 0;
  (globalThis as { crypto?: Crypto }).crypto = {
    randomUUID: () => `request-${++uuidCounter}`,
  } as unknown as Crypto;
};

const restoreCrypto = () => {
  (globalThis as { crypto?: Crypto }).crypto = originalCrypto;
};

const createUserMessage = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const readOutgoingMessages = (socket: FakeWebSocket) =>
  socket.sent.map((entry) => JSON.parse(entry));

const readStreamChunks = async (stream: ReadableStream<UIMessageChunk>) => {
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
  return chunks;
};

const readStreamError = async (stream: ReadableStream<UIMessageChunk>) => {
  const reader = stream.getReader();
  try {
    await reader.read();
    return null;
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    return "unknown_error";
  } finally {
    reader.releaseLock();
  }
};

const sendChunk = (socket: FakeWebSocket, requestId: string) => {
  const payload = {
    type: "ui.chunk",
    requestId,
    chunk: { type: "text-delta", text: "hello" },
  };
  socket.trigger("message", JSON.stringify(payload));
};

const sendDone = (socket: FakeWebSocket, requestId: string) => {
  const payload = { type: "ui.done", requestId };
  socket.trigger("message", JSON.stringify(payload));
};

const sendError = (socket: FakeWebSocket, requestId: string) => {
  const payload = { type: "ui.error", requestId, error: "boom" };
  socket.trigger("message", JSON.stringify(payload));
};

const captureTransportEvents = () => {
  const events: TransportEvent[] = [];
  const onEvent = (event: TransportEvent) => {
    events.push(event);
  };
  return { events, onEvent };
};

beforeEach(() => {
  FakeWebSocket.reset();
  installFakeWebSocket();
  installFakeCrypto();
});

afterEach(() => {
  restoreWebSocket();
  restoreCrypto();
});

describe("Adapter AI SDK WebSocket transport", () => {
  it("sends auth and chat payload on open", async () => {
    const capture = captureTransportEvents();
    const transport = createAiSdkWebSocketChatTransport({
      url: "ws://example",
      readAuth: () => [{ providerId: "openai", token: "sk-test" }],
      readData: () => ({ recipeId: "rag" }),
      onEvent: capture.onEvent,
    });

    void (await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: "m1",
      messages: [createUserMessage("m1", "hello")],
      abortSignal: undefined,
    }));

    const socket = FakeWebSocket.latest();
    expect(socket).not.toBeNull();
    socket?.trigger("open");

    const outgoing = socket ? readOutgoingMessages(socket) : [];
    expect(outgoing.length).toBe(2);
    expect(outgoing[0]?.type).toBe("auth.set");
    expect(outgoing[1]?.type).toBe("chat.send");
    expect(outgoing[1]?.data?.recipeId).toBe("rag");
    expect(capture.events.length).toBeGreaterThan(0);
  });

  it("streams chunks and closes on done", async () => {
    const transport = createAiSdkWebSocketChatTransport({ url: "ws://example" });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-2",
      messageId: "m2",
      messages: [createUserMessage("m2", "hi")],
      abortSignal: undefined,
    });

    const socket = FakeWebSocket.latest();
    expect(socket).not.toBeNull();
    socket?.trigger("open");

    const outgoing = socket ? readOutgoingMessages(socket) : [];
    const requestId = outgoing[0]?.requestId ?? "request-1";

    if (socket) {
      sendChunk(socket, requestId);
      sendDone(socket, requestId);
    }

    const chunks = await readStreamChunks(stream);
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.type).toBe("text-delta");
  });

  it("emits error chunks and closes on error", async () => {
    const transport = createAiSdkWebSocketChatTransport({ url: "ws://example" });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-3",
      messageId: "m3",
      messages: [createUserMessage("m3", "hi")],
      abortSignal: undefined,
    });

    const socket = FakeWebSocket.latest();
    expect(socket).not.toBeNull();
    socket?.trigger("open");

    const outgoing = socket ? readOutgoingMessages(socket) : [];
    const requestId = outgoing[0]?.requestId ?? "request-1";

    if (socket) {
      sendError(socket, requestId);
    }

    const chunks = await readStreamChunks(stream);
    expect(chunks[0]).toEqual({ type: "error", errorText: "boom" });
    expect(socket?.closed).toBe(true);
  });

  it("ignores mismatched request ids and invalid messages", async () => {
    const capture = captureTransportEvents();
    const transport = createAiSdkWebSocketChatTransport({
      url: "ws://example",
      onEvent: capture.onEvent,
    });
    void (await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-4",
      messageId: "m4",
      messages: [createUserMessage("m4", "hi")],
      abortSignal: undefined,
    }));

    const socket = FakeWebSocket.latest();
    expect(socket).not.toBeNull();
    socket?.trigger("open");

    if (socket) {
      socket.trigger("message", "not-json");
      socket.trigger(
        "message",
        JSON.stringify({ type: "ui.chunk", requestId: "wrong", chunk: { type: "text-delta" } }),
      );
    }

    expect(capture.events.length).toBe(1);
  });

  it("closes socket on abort", async () => {
    const abortController = new AbortController();
    const transport = createAiSdkWebSocketChatTransport({ url: "ws://example" });

    void (await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-5",
      messageId: "m5",
      messages: [createUserMessage("m5", "hi")],
      abortSignal: abortController.signal,
    }));

    const socket = FakeWebSocket.latest();
    expect(socket?.closed).toBe(false);
    abortController.abort();
    expect(socket?.closed).toBe(true);
  });

  it("returns null when reconnecting", async () => {
    const transport = createAiSdkWebSocketChatTransport({ url: "ws://example" });
    const stream = await transport.reconnectToStream({
      chatId: "chat-reconnect",
    });

    expect(stream).toBeNull();
  });

  it("closes socket when stream is canceled", async () => {
    const transport = createAiSdkWebSocketChatTransport({ url: "ws://example" });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-6",
      messageId: "m6",
      messages: [createUserMessage("m6", "hi")],
      abortSignal: undefined,
    });

    const socket = FakeWebSocket.latest();
    expect(socket).not.toBeNull();
    await stream.cancel();
    expect(socket?.closed).toBe(true);
  });

  it("closes and errors on socket error", async () => {
    const transport = createAiSdkWebSocketChatTransport({ url: "ws://example" });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-7",
      messageId: "m7",
      messages: [createUserMessage("m7", "hi")],
      abortSignal: undefined,
    });

    const socket = FakeWebSocket.latest();
    expect(socket).not.toBeNull();
    socket?.trigger("error");

    const errorMessage = await readStreamError(stream);
    expect(errorMessage).toBe("socket_error");
    expect(socket?.closed).toBe(true);
  });

  it("closes stream on socket close", async () => {
    const transport = createAiSdkWebSocketChatTransport({ url: "ws://example" });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-8",
      messageId: "m8",
      messages: [createUserMessage("m8", "hi")],
      abortSignal: undefined,
    });

    const socket = FakeWebSocket.latest();
    expect(socket).not.toBeNull();
    socket?.trigger("close");

    const chunks = await readStreamChunks(stream);
    expect(chunks.length).toBe(0);
  });
});
