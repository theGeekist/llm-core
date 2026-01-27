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
  merge: bindFirst(mergeUiStream, { socket, requestId }),
  onError: bindFirst(handleWriterError, { socket, requestId }),
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

const mergeUiStream = async (
  input: { socket: ServerWebSocket<SocketData>; requestId: string },
  stream: ReadableStream<UIMessageChunk>,
) => {
  const reader = stream.getReader();
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && !sendMessage(input.socket, toServerChunkMessage(input.requestId, value))) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
};

const handleWriterError = (
  input: { socket: ServerWebSocket<SocketData>; requestId: string },
  error: unknown,
) => sendUiError(input.socket, input.requestId, String(error));

const sendMessage = (socket: ServerWebSocket<SocketData>, message: ServerMessage) => {
  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
};
