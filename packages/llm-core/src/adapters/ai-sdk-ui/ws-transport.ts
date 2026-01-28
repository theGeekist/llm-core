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
  abortListener: ((event: Event) => void) | null;
  finalized: boolean;
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
  abortListener: null,
  finalized: false,
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

  addAbortListener(state);
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
    finalizeStreamClose(state);
    return true;
  }
  if (payload.type === "ui.done") {
    finalizeStreamClose(state);
    return true;
  }
  return null;
};

const handleSocketClose = (state: StreamState) => {
  finalizeStreamClose(state);
  return true;
};

const handleSocketError = (state: StreamState) => {
  finalizeStreamError(state, new Error("socket_error"));
  return false;
};

const handleAbort = (state: StreamState) => {
  finalizeStreamError(state, new Error("aborted"));
  return false;
};

const addAbortListener = (state: StreamState) => {
  const signal = state.sendOptions.abortSignal;
  if (!signal) {
    return null;
  }
  const listener = bindFirst(handleAbort, state);
  state.abortListener = listener;
  signal.addEventListener("abort", listener);
  return true;
};

const removeAbortListener = (state: StreamState) => {
  const signal = state.sendOptions.abortSignal;
  if (!signal || !state.abortListener) {
    return null;
  }
  signal.removeEventListener("abort", state.abortListener);
  state.abortListener = null;
  return true;
};

const finalizeStream = (state: StreamState) => {
  if (state.finalized) {
    return false;
  }
  state.finalized = true;
  return true;
};

const finalizeStreamClose = (state: StreamState) => {
  if (!finalizeStream(state)) {
    return false;
  }
  safeControllerClose(state.controller);
  closeSocket(state);
  return true;
};

const finalizeStreamError = (state: StreamState, error?: Error) => {
  if (!finalizeStream(state)) {
    return false;
  }
  safeControllerError(state.controller, error ?? new Error("stream_error"));
  closeSocket(state);
  return true;
};

const closeSocket = (state: StreamState) => {
  removeAbortListener(state);
  if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
    state.socket.close();
  }
  state.socket = null;
  return true;
};

const safeControllerClose = (
  controller?: ReadableStreamDefaultController<UIMessageChunk> | null,
) => {
  if (!controller) {
    return null;
  }
  try {
    controller.close();
    return true;
  } catch {
    return false;
  }
};

const safeControllerError = (
  controller: ReadableStreamDefaultController<UIMessageChunk> | null | undefined,
  error: Error,
) => {
  if (!controller) {
    return null;
  }
  try {
    controller.error(error);
    return true;
  } catch {
    return false;
  }
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
    if (!isServerMessageType(parsed.type)) {
      return null;
    }
    if (typeof parsed.requestId !== "string") {
      return null;
    }
    if (parsed.type === "ui.chunk" && !parsed.chunk) {
      return null;
    }
    if (parsed.type === "ui.error" && typeof parsed.error !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const isServerMessageType = (value: unknown) =>
  value === "ui.chunk" || value === "ui.done" || value === "ui.error";

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
  return readTransportDataFromBody(state.sendOptions.body);
};

const readTransportDataFromBody = (value: unknown): WebSocketChatData | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const data: WebSocketChatData = {};
  let hasData = false;
  if (typeof record.recipeId === "string") {
    data.recipeId = record.recipeId;
    hasData = true;
  }
  if (typeof record.adapterSource === "string") {
    data.adapterSource = record.adapterSource;
    hasData = true;
  }
  if (typeof record.providerId === "string") {
    data.providerId = record.providerId;
    hasData = true;
  }
  if (typeof record.modelId === "string") {
    data.modelId = record.modelId;
    hasData = true;
  }
  return hasData ? data : null;
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
