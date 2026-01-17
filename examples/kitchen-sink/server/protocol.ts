import type { UIMessage, UIMessageChunk } from "ai";

export type ClientChatRequest = {
  type: "chat.send";
  requestId: string;
  chatId: string;
  messages: UIMessage[];
  data?: {
    recipeId?: string;
    adapterSource?: string;
    providerId?: string;
    modelId?: string;
  };
};

export type ClientAuthRequest = {
  type: "auth.set";
  providerId: string;
  token: string;
};

export type ClientMessage = ClientChatRequest | ClientAuthRequest;

export type ServerChunkMessage = {
  type: "ui.chunk";
  requestId: string;
  chunk: UIMessageChunk;
};

export type ServerDoneMessage = {
  type: "ui.done";
  requestId: string;
  status?: string;
  token?: string | null;
};

export type ServerErrorMessage = {
  type: "ui.error";
  requestId: string;
  error: string;
};

export type ServerMessage = ServerChunkMessage | ServerDoneMessage | ServerErrorMessage;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const parseClientMessage = (payload: string): ClientMessage | null => {
  const parsed = safeParseJson(payload);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as Record<string, JsonValue>;
  if (record.type === "auth.set") {
    if (typeof record.providerId !== "string" || typeof record.token !== "string") {
      return null;
    }
    return {
      type: "auth.set",
      providerId: record.providerId,
      token: record.token,
    };
  }
  if (record.type !== "chat.send") {
    return null;
  }
  if (typeof record.requestId !== "string" || typeof record.chatId !== "string") {
    return null;
  }
  const messages = readUiMessages(record.messages);
  const dataValue = record.data ?? null;
  const data = readClientData(dataValue) ?? undefined;
  return {
    type: "chat.send",
    requestId: record.requestId,
    chatId: record.chatId,
    messages,
    data,
  };
};

export const toServerChunkMessage = (
  requestId: string,
  chunk: UIMessageChunk,
): ServerChunkMessage => ({
  type: "ui.chunk",
  requestId,
  chunk,
});

export const toServerDoneMessage = (
  requestId: string,
  status?: string,
  token?: string | null,
): ServerDoneMessage => ({
  type: "ui.done",
  requestId,
  status,
  token: token ?? null,
});

export const toServerErrorMessage = (requestId: string, error: string): ServerErrorMessage => ({
  type: "ui.error",
  requestId,
  error,
});

export const safeParseJson = (payload: string): JsonValue | null => {
  try {
    return JSON.parse(payload) as JsonValue;
  } catch {
    return null;
  }
};

export const isRecord = (value: JsonValue | null | undefined): value is Record<string, JsonValue> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const readClientData = (value: JsonValue | null | undefined) => {
  if (!isRecord(value)) {
    return null;
  }
  const data: {
    recipeId?: string;
    adapterSource?: string;
    providerId?: string;
    modelId?: string;
  } = {};
  if (typeof value.recipeId === "string") {
    data.recipeId = value.recipeId;
  }
  if (typeof value.adapterSource === "string") {
    data.adapterSource = value.adapterSource;
  }
  if (typeof value.providerId === "string") {
    data.providerId = value.providerId;
  }
  if (typeof value.modelId === "string") {
    data.modelId = value.modelId;
  }
  return data;
};

const readUiMessages = (value: JsonValue | undefined): UIMessage[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  if (!value.every(isUiMessageShape)) {
    return [];
  }
  return value as unknown as UIMessage[];
};

const isUiRole = (value: JsonValue | undefined): boolean =>
  value === "user" ||
  value === "assistant" ||
  value === "system" ||
  value === "tool" ||
  value === "data";

const isUiMessagePartShape = (value: JsonValue): boolean =>
  isRecord(value) && typeof value.type === "string";

const isUiMessageShape = (value: JsonValue): boolean =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isUiRole(value.role) &&
  Array.isArray(value.parts) &&
  value.parts.every(isUiMessagePartShape);
