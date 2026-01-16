/// <reference lib="dom" />
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { bindFirst, toUndefined } from "#shared/fp";

export type WebSocketChatData = {
  recipeId?: string;
  adapterSource?: string;
  providerId?: string;
  modelId?: string;
};

export type AuthToken = {
  providerId: string;
  token: string;
};

export type TransportEvent = {
  direction: "incoming" | "outgoing";
  message: ClientMessage | ServerMessage;
};

export type AiSdkWebSocketChatTransportOptions = {
  url: string;
  readData?: () => WebSocketChatData | null;
  readAuth?: () => AuthToken[] | null;
  onEvent?: (event: TransportEvent) => void;
};

type SendOptions<UI_MESSAGE extends UIMessage> = Parameters<
  ChatTransport<UI_MESSAGE>["sendMessages"]
>[0];

type StreamState = {
  socket: WebSocket | null;
  controller: ReadableStreamDefaultController<UIMessageChunk> | null;
  requestId: string;
  options: AiSdkWebSocketChatTransportOptions;
  sendOptions: SendOptions<UIMessage>;
};

export const createAiSdkWebSocketChatTransport = (
  options: AiSdkWebSocketChatTransportOptions,
): ChatTransport<UIMessage> => new AiSdkWebSocketChatTransportImpl(options);

class AiSdkWebSocketChatTransportImpl implements ChatTransport<UIMessage> {
  private options: AiSdkWebSocketChatTransportOptions;

  constructor(options: AiSdkWebSocketChatTransportOptions) {
    this.options = options;
  }

  async sendMessages(options: SendOptions<UIMessage>): Promise<ReadableStream<UIMessageChunk>> {
    const requestId = crypto.randomUUID();
    const state = createStreamState(requestId, this.options, options);
    return createStream(state);
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

const createStreamState = (
  requestId: string,
  options: AiSdkWebSocketChatTransportOptions,
  sendOptions: SendOptions<UIMessage>,
): StreamState => ({
  socket: null,
  controller: null,
  requestId,
  options,
  sendOptions,
});

const createStream = (state: StreamState): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    start: bindFirst(startStreamInterop, state),
    cancel: bindFirst(cancelStreamInterop, state),
  }) as ReadableStream<UIMessageChunk>;

const startStream = (
  state: StreamState,
  controller: ReadableStreamDefaultController<UIMessageChunk>,
) => {
  state.controller = controller;
  const socket = new WebSocket(state.options.url);
  state.socket = socket;

  socket.addEventListener("open", bindFirst(handleSocketOpen, state));
  socket.addEventListener("message", bindFirst(handleSocketMessage, state));
  socket.addEventListener("close", bindFirst(handleSocketClose, state));
  socket.addEventListener("error", bindFirst(handleSocketError, state));

  if (state.sendOptions.abortSignal) {
    state.sendOptions.abortSignal.addEventListener("abort", bindFirst(handleAbort, state));
  }
  return true;
};

const cancelStream = (state: StreamState) => closeSocket(state);

const startStreamInterop = (
  state: StreamState,
  controller: ReadableStreamDefaultController<UIMessageChunk>,
) => {
  startStream(state, controller);
  return toUndefined();
};

const cancelStreamInterop = (state: StreamState) => {
  cancelStream(state);
  return toUndefined();
};

const handleSocketOpen = (state: StreamState) => {
  sendAuthTokens(state);
  sendChatPayload(state);
  return true;
};

const handleSocketMessage = (state: StreamState, event: MessageEvent) => {
  const payload = typeof event.data === "string" ? parseServerMessage(event.data) : null;
  if (!payload) {
    return null;
  }
  if (payload.requestId !== state.requestId) {
    return null;
  }
  emitTransportEvent(state.options, { direction: "incoming", message: payload });
  if (payload.type === "ui.chunk") {
    state.controller?.enqueue(payload.chunk);
    return true;
  }
  if (payload.type === "ui.error") {
    state.controller?.enqueue({ type: "error", errorText: payload.error });
    state.controller?.close();
    closeSocket(state);
    return false;
  }
  if (payload.type === "ui.done") {
    state.controller?.close();
    closeSocket(state);
    return true;
  }
  return null;
};

const handleSocketClose = (state: StreamState) => {
  state.controller?.close();
  return true;
};

const handleSocketError = (state: StreamState) => {
  state.controller?.error(new Error("socket_error"));
  return false;
};

const handleAbort = (state: StreamState) => {
  state.controller?.error(new Error("aborted"));
  closeSocket(state);
  return false;
};

const closeSocket = (state: StreamState) => {
  if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
    state.socket.close();
  }
  state.socket = null;
  return true;
};

type ClientChatMessage = {
  type: "chat.send";
  requestId: string;
  chatId: string;
  messages: UIMessage[];
  data: WebSocketChatData | null;
};

type ClientAuthMessage = {
  type: "auth.set";
  providerId: string;
  token: string;
};

type ClientMessage = ClientChatMessage | ClientAuthMessage;

type ServerMessage =
  | { type: "ui.chunk"; requestId: string; chunk: UIMessageChunk }
  | { type: "ui.done"; requestId: string; status?: string; token?: string | null }
  | { type: "ui.error"; requestId: string; error: string };

const parseServerMessage = (data: string): ServerMessage | null => {
  try {
    const parsed = JSON.parse(data) as ServerMessage;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const emitTransportEvent = (options: AiSdkWebSocketChatTransportOptions, event: TransportEvent) => {
  if (!options.onEvent) {
    return null;
  }
  options.onEvent(event);
  return true;
};

const readTransportData = (state: StreamState) => {
  if (state.options.readData) {
    return state.options.readData();
  }
  if (!state.sendOptions.body) {
    return null;
  }
  const payload = state.sendOptions.body as WebSocketChatData;
  return typeof payload === "object" ? payload : null;
};

const readAuthTokens = (state: StreamState) => {
  if (!state.options.readAuth) {
    return null;
  }
  return state.options.readAuth();
};

const sendAuthTokens = (state: StreamState) => {
  const tokens = readAuthTokens(state) ?? [];
  for (const token of tokens) {
    sendAuthMessage(state, token);
  }
  return true;
};

const sendAuthMessage = (state: StreamState, token: AuthToken) => {
  if (!state.socket) {
    return null;
  }
  const payload: ClientAuthMessage = {
    type: "auth.set",
    providerId: token.providerId,
    token: token.token,
  };
  emitTransportEvent(state.options, { direction: "outgoing", message: payload });
  state.socket.send(JSON.stringify(payload));
  return true;
};

const sendChatPayload = (state: StreamState) => {
  if (!state.socket) {
    return null;
  }
  const payload: ClientChatMessage = {
    type: "chat.send",
    requestId: state.requestId,
    chatId: state.sendOptions.chatId,
    messages: state.sendOptions.messages,
    data: readTransportData(state),
  };
  emitTransportEvent(state.options, { direction: "outgoing", message: payload });
  state.socket.send(JSON.stringify(payload));
  return true;
};
