/// <reference types="bun-types" />
import type { UIMessageChunk, UIMessageStreamWriter } from "ai";
import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "./protocol";
import { toServerChunkMessage, toServerDoneMessage, toServerErrorMessage } from "./protocol";
import type { SocketData } from "./socket-data";
import { bindFirst } from "@geekist/llm-core";

export const createWebSocketUiWriter = (
  socket: ServerWebSocket<SocketData>,
  requestId: string,
): UIMessageStreamWriter => ({
  write: bindFirst(writeUiChunk, { socket, requestId }),
  merge: mergeUiStream,
  onError: handleWriterError,
});

export const sendUiDone = (input: {
  socket: ServerWebSocket<SocketData>;
  requestId: string;
  status?: string;
  token?: string | null;
}) => sendMessage(input.socket, toServerDoneMessage(input.requestId, input.status, input.token));

export const sendUiError = (
  socket: ServerWebSocket<SocketData>,
  requestId: string,
  message: string,
) => sendMessage(socket, toServerErrorMessage(requestId, message));

const writeUiChunk = (
  input: { socket: ServerWebSocket<SocketData>; requestId: string },
  chunk: UIMessageChunk,
) => sendMessage(input.socket, toServerChunkMessage(input.requestId, chunk));

const mergeUiStream = (_stream: ReadableStream<UIMessageChunk>) => true;

const handleWriterError = (_error: unknown) => false;

const sendMessage = (socket: ServerWebSocket<SocketData>, message: ServerMessage) => {
  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
};
