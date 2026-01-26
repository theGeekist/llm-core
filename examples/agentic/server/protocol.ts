import type { UIMessage, UIMessageChunk } from "ai";
import type { AgentLoopConfig } from "@geekist/llm-core/interaction";
import type { AgentSubagentOptions } from "@geekist/llm-core/interaction";

export type ClientChatData = {
  adapterSource?: string;
  providerId?: string;
  modelId?: string;
  agentConfig?: AgentLoopConfig;
  subagents?: AgentSubagentOptions;
  context?: string;
  threadId?: string;
};

export type ClientChatRequest = {
  type: "chat.send";
  requestId: string;
  chatId: string;
  messages: UIMessage[];
  data?: ClientChatData;
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
  if (!messages) {
    return null;
  }
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
  const data: ClientChatData = {};
  if (typeof value.adapterSource === "string") {
    data.adapterSource = value.adapterSource;
  }
  if (typeof value.providerId === "string") {
    data.providerId = value.providerId;
  }
  if (typeof value.modelId === "string") {
    data.modelId = value.modelId;
  }
  const agentConfig = readAgentConfig(value.agentConfig);
  if (agentConfig) {
    data.agentConfig = agentConfig;
  }
  const subagents = readSubagentOptions(value.subagents);
  if (subagents) {
    data.subagents = subagents;
  }
  if (typeof value.context === "string") {
    data.context = value.context;
  }
  if (typeof value.threadId === "string") {
    data.threadId = value.threadId;
  }
  return data;
};

const readUiMessages = (value: JsonValue | undefined): UIMessage[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every(isUiMessageShape)) {
    return null;
  }
  return value as unknown as UIMessage[];
};

const isUiRole = (value: JsonValue | undefined): boolean =>
  value === "user" || value === "assistant" || value === "system";

const isUiMessagePartShape = (value: JsonValue): boolean =>
  isRecord(value) && typeof value.type === "string";

const isUiMessageShape = (value: JsonValue): boolean =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isUiRole(value.role) &&
  Array.isArray(value.parts) &&
  value.parts.every(isUiMessagePartShape);

const readAgentConfig = (value: JsonValue | undefined): AgentLoopConfig | null => {
  if (!isRecord(value)) {
    return null;
  }
  return value as unknown as AgentLoopConfig;
};

const readSubagentOptions = (value: JsonValue | undefined): AgentSubagentOptions | null => {
  if (!isRecord(value)) {
    return null;
  }
  const config: AgentSubagentOptions = {};
  if (typeof value.enabled === "boolean") {
    config.enabled = value.enabled;
  }
  if (typeof value.maxActive === "number" && Number.isFinite(value.maxActive)) {
    config.maxActive = value.maxActive;
  }
  if (typeof value.idPrefix === "string") {
    config.idPrefix = value.idPrefix;
  }
  return config;
};
