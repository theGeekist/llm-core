/// <reference lib="dom" />
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

export interface AiSdkUiWebSocketData {
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface AiSdkUiAuthToken {
  readonly providerId: string;
  readonly token: string;
}

type ClientMessage =
  | { readonly type: "auth.set"; readonly providerId: string; readonly token: string }
  | {
      readonly type: "chat.send";
      readonly requestId: string;
      readonly chatId: string;
      readonly messages: UIMessage[];
      readonly data: AiSdkUiWebSocketData | null;
    };

type ServerMessage =
  | { readonly type: "ui.chunk"; readonly requestId: string; readonly chunk: UIMessageChunk }
  | { readonly type: "ui.done"; readonly requestId: string }
  | { readonly type: "ui.error"; readonly requestId: string; readonly error: string };

export interface AiSdkUiWebSocketEvent {
  readonly direction: "incoming" | "outgoing";
  readonly message: ServerMessage | (ClientMessage & { readonly token?: "[redacted]" });
}

export interface AiSdkUiWebSocketTransportOptions {
  readonly url: string;
  readonly readData?: () => AiSdkUiWebSocketData | null;
  readonly readAuth?: () => readonly AiSdkUiAuthToken[] | null;
  readonly onEvent?: (event: AiSdkUiWebSocketEvent) => void;
  readonly socketFactory?: (url: string) => WebSocket;
  readonly newRequestId?: () => string;
}

type SendOptions = Parameters<ChatTransport<UIMessage>["sendMessages"]>[0];

interface StreamState {
  readonly requestId: string;
  readonly options: AiSdkUiWebSocketTransportOptions;
  readonly sendOptions: SendOptions;
  socket?: WebSocket;
  controller?: ReadableStreamDefaultController<UIMessageChunk>;
  abort?: () => void;
  finalized: boolean;
}

const parseServerMessage = (value: unknown): ServerMessage | null => {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed.requestId !== "string") return null;
    if (parsed.type === "ui.chunk" && parsed.chunk && typeof parsed.chunk === "object") {
      return parsed as unknown as ServerMessage;
    }
    if (parsed.type === "ui.done") return { type: "ui.done", requestId: parsed.requestId };
    if (parsed.type === "ui.error" && typeof parsed.error === "string") {
      return { type: "ui.error", requestId: parsed.requestId, error: parsed.error };
    }
  } catch {
    return null;
  }
  return null;
};

const observableClientMessage = (
  message: ClientMessage,
): ClientMessage & { readonly token?: "[redacted]" } =>
  message.type === "auth.set" ? { ...message, token: "[redacted]" } : message;

const finalize = (state: StreamState, error?: Error): void => {
  if (state.finalized) return;
  state.finalized = true;
  if (state.abort && state.sendOptions.abortSignal) {
    state.sendOptions.abortSignal.removeEventListener("abort", state.abort);
  }
  try {
    if (error) state.controller?.error(error);
    else state.controller?.close();
  } finally {
    if (state.socket && state.socket.readyState !== WebSocket.CLOSED) state.socket.close();
  }
};

const send = (state: StreamState, message: ClientMessage): void => {
  state.options.onEvent?.({ direction: "outgoing", message: observableClientMessage(message) });
  state.socket?.send(JSON.stringify(message));
};

const start = (
  state: StreamState,
  controller: ReadableStreamDefaultController<UIMessageChunk>,
): void => {
  state.controller = controller;
  if (state.sendOptions.abortSignal?.aborted) {
    finalize(state, new Error("aborted"));
    return;
  }
  const socket = (state.options.socketFactory ?? ((url) => new WebSocket(url)))(state.options.url);
  state.socket = socket;
  socket.addEventListener("open", () => {
    for (const auth of state.options.readAuth?.() ?? []) {
      send(state, { type: "auth.set", providerId: auth.providerId, token: auth.token });
    }
    send(state, {
      type: "chat.send",
      requestId: state.requestId,
      chatId: state.sendOptions.chatId,
      messages: state.sendOptions.messages,
      data: state.options.readData?.() ?? null,
    });
  });
  socket.addEventListener("message", (event) => {
    const message = parseServerMessage(event.data);
    if (!message || message.requestId !== state.requestId) return;
    state.options.onEvent?.({ direction: "incoming", message });
    if (message.type === "ui.chunk") {
      controller.enqueue(message.chunk);
    } else if (message.type === "ui.error") {
      controller.enqueue({ type: "error", errorText: message.error });
      finalize(state);
    } else {
      finalize(state);
    }
  });
  socket.addEventListener("close", () => {
    if (!state.finalized) finalize(state, new Error("socket-closed"));
  });
  socket.addEventListener("error", () => finalize(state, new Error("socket-error")));
  if (state.sendOptions.abortSignal) {
    state.abort = () => finalize(state, new Error("aborted"));
    state.sendOptions.abortSignal.addEventListener("abort", state.abort);
  }
};

class AiSdkUiWebSocketTransport implements ChatTransport<UIMessage> {
  constructor(private readonly options: AiSdkUiWebSocketTransportOptions) {}

  async sendMessages(sendOptions: SendOptions): Promise<ReadableStream<UIMessageChunk>> {
    const state: StreamState = {
      requestId: this.options.newRequestId?.() ?? crypto.randomUUID(),
      options: this.options,
      sendOptions,
      finalized: false,
    };
    return new ReadableStream({
      start: (controller) => start(state, controller),
      cancel: () => finalize(state),
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

export const createAiSdkUiWebSocketTransport = (
  options: AiSdkUiWebSocketTransportOptions,
): ChatTransport<UIMessage> => new AiSdkUiWebSocketTransport(options);
