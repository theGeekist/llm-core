import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import {
  createAiSdkUiWebSocketTransport,
  type AiSdkUiWebSocketEvent,
} from "../../../src/adapters/ui/ai-sdk";

class FakeSocket extends EventTarget {
  readonly sent: string[] = [];
  readyState: number = WebSocket.OPEN;

  send(value: string): void {
    this.sent.push(value);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
  }

  open(): void {
    this.dispatchEvent(new Event("open"));
  }

  message(value: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) }));
  }
}

const sendOptions = (abortSignal?: AbortSignal) =>
  ({
    trigger: "submit-message",
    chatId: "chat-1",
    messageId: "message-1",
    messages: [
      { id: "message-1", role: "user", parts: [{ type: "text", text: "hi" }] },
    ] as UIMessage[],
    abortSignal,
  }) as Parameters<ReturnType<typeof createAiSdkUiWebSocketTransport>["sendMessages"]>[0];

describe("AI SDK UI WebSocket transport", () => {
  test("redacts auth observations and correlates incoming chunks", async () => {
    const socket = new FakeSocket();
    const events: AiSdkUiWebSocketEvent[] = [];
    const transport = createAiSdkUiWebSocketTransport({
      url: "wss://example.test/chat",
      socketFactory: () => socket as unknown as WebSocket,
      newRequestId: () => "request-1",
      readAuth: () => [{ providerId: "provider", token: "secret-token" }],
      onEvent: (event) => events.push(event),
    });
    const stream = await transport.sendMessages(sendOptions());
    const reader = stream.getReader();

    socket.open();
    expect(socket.sent).toHaveLength(2);
    expect(events[0]).toEqual({
      direction: "outgoing",
      message: { type: "auth.set", providerId: "provider", token: "[redacted]" },
    });
    expect(JSON.stringify(events)).not.toContain("secret-token");

    socket.message({
      type: "ui.chunk",
      requestId: "another-request",
      chunk: { type: "text-delta", id: "text", delta: "ignored" },
    });
    socket.message({
      type: "ui.chunk",
      requestId: "request-1",
      chunk: { type: "text-delta", id: "text", delta: "hello" },
    });
    expect(await reader.read()).toEqual({
      done: false,
      value: { type: "text-delta", id: "text", delta: "hello" },
    });

    socket.message({ type: "ui.done", requestId: "request-1" });
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  test("projects server failures into a terminal AI SDK error chunk", async () => {
    const socket = new FakeSocket();
    const transport = createAiSdkUiWebSocketTransport({
      url: "wss://example.test/chat",
      socketFactory: () => socket as unknown as WebSocket,
      newRequestId: () => "request-2",
    });
    const reader = (await transport.sendMessages(sendOptions())).getReader();
    socket.open();
    socket.message({ type: "ui.error", requestId: "request-2", error: "safe-failure" });

    expect(await reader.read()).toEqual({
      done: false,
      value: { type: "error", errorText: "safe-failure" },
    });
    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });

  test("rejects native, sensitive, and structurally open chunks before observation", async () => {
    const socket = new FakeSocket();
    const events: AiSdkUiWebSocketEvent[] = [];
    const transport = createAiSdkUiWebSocketTransport({
      url: "wss://example.test/chat",
      socketFactory: () => socket as unknown as WebSocket,
      newRequestId: () => "request-safe",
      onEvent: (event) => events.push(event),
    });
    const reader = (await transport.sendMessages(sendOptions())).getReader();
    socket.open();

    socket.message({
      type: "ui.chunk",
      requestId: "request-safe",
      chunk: { type: "data-provider", data: { apiKey: "secret" } },
    });
    socket.message({
      type: "ui.chunk",
      requestId: "request-safe",
      chunk: {
        type: "tool-output-available",
        toolCallId: "call-1",
        output: { accessToken: "secret" },
      },
    });
    socket.message({
      type: "ui.chunk",
      requestId: "request-safe",
      chunk: {
        type: "text-delta",
        id: "text",
        delta: "looks safe",
        providerMetadata: { provider: { native: true } },
      },
    });
    socket.message({
      type: "ui.chunk",
      requestId: "request-safe",
      chunk: { type: "text-delta", id: "text", delta: "accepted" },
    });

    expect(await reader.read()).toEqual({
      done: false,
      value: { type: "text-delta", id: "text", delta: "accepted" },
    });
    expect(JSON.stringify(events)).not.toContain("secret");
    expect(events.filter((event) => event.direction === "incoming")).toHaveLength(1);
    socket.message({ type: "ui.done", requestId: "request-safe" });
  });

  test("closes the live socket when the caller aborts", async () => {
    const socket = new FakeSocket();
    const abort = new AbortController();
    const transport = createAiSdkUiWebSocketTransport({
      url: "wss://example.test/chat",
      socketFactory: () => socket as unknown as WebSocket,
    });
    const reader = (await transport.sendMessages(sendOptions(abort.signal))).getReader();
    socket.open();
    abort.abort();

    await expect(reader.read()).rejects.toThrow("aborted");
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  test("sends or processes nothing when aborted before the socket opens", async () => {
    const socket = new FakeSocket();
    const abort = new AbortController();
    const events: AiSdkUiWebSocketEvent[] = [];
    const transport = createAiSdkUiWebSocketTransport({
      url: "wss://example.test/chat",
      socketFactory: () => socket as unknown as WebSocket,
      newRequestId: () => "request-aborted",
      readAuth: () => [{ providerId: "provider", token: "secret-token" }],
      onEvent: (event) => events.push(event),
    });
    const reader = (await transport.sendMessages(sendOptions(abort.signal))).getReader();

    abort.abort();
    socket.open();
    socket.message({
      type: "ui.chunk",
      requestId: "request-aborted",
      chunk: { type: "text-delta", id: "text", delta: "late" },
    });

    await expect(reader.read()).rejects.toThrow("aborted");
    expect(socket.sent).toEqual([]);
    expect(events).toEqual([]);
  });

  test("sends or processes nothing when cancelled before the socket opens", async () => {
    const socket = new FakeSocket();
    const events: AiSdkUiWebSocketEvent[] = [];
    const transport = createAiSdkUiWebSocketTransport({
      url: "wss://example.test/chat",
      socketFactory: () => socket as unknown as WebSocket,
      newRequestId: () => "request-cancelled",
      readAuth: () => [{ providerId: "provider", token: "secret-token" }],
      onEvent: (event) => events.push(event),
    });
    const stream = await transport.sendMessages(sendOptions());

    await stream.cancel();
    socket.open();
    socket.message({
      type: "ui.chunk",
      requestId: "request-cancelled",
      chunk: { type: "text-delta", id: "text", delta: "late" },
    });

    expect(socket.sent).toEqual([]);
    expect(events).toEqual([]);
  });

  test("does not send when open callbacks abort re-entrantly", async () => {
    for (const callback of ["readAuth", "readData", "onEvent"] as const) {
      const socket = new FakeSocket();
      const abort = new AbortController();
      const events: AiSdkUiWebSocketEvent[] = [];
      const transport = createAiSdkUiWebSocketTransport({
        url: "wss://example.test/chat",
        socketFactory: () => socket as unknown as WebSocket,
        newRequestId: () => `request-${callback}`,
        readAuth: () => {
          if (callback === "readAuth") abort.abort();
          return [{ providerId: "provider", token: "secret-token" }];
        },
        readData: () => {
          if (callback === "readData") abort.abort();
          return null;
        },
        onEvent: (event) => {
          events.push(event);
          if (callback === "onEvent") abort.abort();
        },
      });
      const reader = (await transport.sendMessages(sendOptions(abort.signal))).getReader();

      socket.open();

      await expect(reader.read()).rejects.toThrow("aborted");
      const sentTypes = socket.sent.map(
        (message) => (JSON.parse(message) as { type: string }).type,
      );
      expect(sentTypes).toEqual(callback === "readData" ? ["auth.set"] : []);
      expect(sentTypes).not.toContain("chat.send");
      expect(JSON.stringify(events)).not.toContain("secret-token");
    }
  });

  test("does not enqueue when an incoming observer aborts re-entrantly", async () => {
    const socket = new FakeSocket();
    const abort = new AbortController();
    const events: AiSdkUiWebSocketEvent[] = [];
    const transport = createAiSdkUiWebSocketTransport({
      url: "wss://example.test/chat",
      socketFactory: () => socket as unknown as WebSocket,
      newRequestId: () => "request-incoming-abort",
      onEvent: (event) => {
        events.push(event);
        if (event.direction === "incoming") abort.abort();
      },
    });
    const reader = (await transport.sendMessages(sendOptions(abort.signal))).getReader();
    socket.open();

    socket.message({
      type: "ui.chunk",
      requestId: "request-incoming-abort",
      chunk: { type: "text-delta", id: "text", delta: "must-not-enqueue" },
    });

    await expect(reader.read()).rejects.toThrow("aborted");
    expect(events.filter((event) => event.direction === "incoming")).toHaveLength(1);
  });
});
