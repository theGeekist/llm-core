import type { Message, MessagePart } from "../types";
import { isRecord } from "#shared/guards";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type AssistantTransportMessagePart =
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      toolName: string;
      toolCallId?: string | null;
      args?: Record<string, JsonValue> | null;
    }
  | {
      type: "tool-result";
      toolName: string;
      toolCallId?: string | null;
      result: JsonValue;
      isError?: boolean | null;
    };

export type AssistantTransportMessage = {
  role: "user" | "assistant" | "tool";
  parts: AssistantTransportMessagePart[];
};

export type AddMessageCommand = {
  type: "add-message";
  message: AssistantTransportMessage;
};

export type AddToolResultCommand = {
  type: "add-tool-result";
  toolCallId: string;
  toolName?: string | null;
  result: JsonValue;
  isError?: boolean | null;
};

export type AssistantTransportCommand = AddMessageCommand | AddToolResultCommand;

export type AssistantTransportRequest = {
  commands: AssistantTransportCommand[];
  data?: {
    recipeId?: string;
    adapterSource?: string;
    providerId?: string;
    modelId?: string;
    chatId?: string;
  };
};

export const parseAssistantTransportRequest = (
  value: unknown,
): AssistantTransportRequest | null => {
  if (!isRecord(value)) {
    return null;
  }
  const commandsValue = value.commands;
  if (!Array.isArray(commandsValue)) {
    return null;
  }
  const commands = readCommands(commandsValue);
  if (!commands) {
    return null;
  }
  const data = readData(value.data);
  return {
    commands,
    data,
  };
};

export const toCoreMessagesFromAssistantCommands = (
  commands: AssistantTransportCommand[],
): Message[] => {
  const messages: Message[] = [];
  for (const command of commands) {
    if (command.type === "add-message") {
      const message = toMessageFromTransport(command.message);
      if (message) {
        messages.push(message);
      }
    }
    if (command.type === "add-tool-result") {
      messages.push(toToolResultMessage(command));
    }
  }
  return messages;
};

const readCommands = (value: unknown[]): AssistantTransportCommand[] | null => {
  const commands: AssistantTransportCommand[] = [];
  for (const entry of value) {
    const parsed = readCommand(entry);
    if (!parsed) {
      return null;
    }
    commands.push(parsed);
  }
  return commands;
};

const readCommand = (value: unknown): AssistantTransportCommand | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (value.type === "add-message") {
    const message = readMessage(value.message);
    if (!message) {
      return null;
    }
    return { type: "add-message", message };
  }
  if (value.type === "add-tool-result") {
    if (typeof value.toolCallId !== "string") {
      return null;
    }
    return {
      type: "add-tool-result",
      toolCallId: value.toolCallId,
      toolName: typeof value.toolName === "string" ? value.toolName : null,
      result: readJsonValue(value.result),
      isError: typeof value.isError === "boolean" ? value.isError : null,
    };
  }
  return null;
};

const readMessage = (value: unknown): AssistantTransportMessage | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (value.role !== "user" && value.role !== "assistant" && value.role !== "tool") {
    return null;
  }
  if (!Array.isArray(value.parts)) {
    return null;
  }
  const parts = readParts(value.parts);
  if (!parts) {
    return null;
  }
  return {
    role: value.role,
    parts,
  };
};

const readParts = (value: unknown[]): AssistantTransportMessagePart[] | null => {
  const parts: AssistantTransportMessagePart[] = [];
  for (const entry of value) {
    const parsed = readPart(entry);
    if (!parsed) {
      return null;
    }
    parts.push(parsed);
  }
  return parts;
};

const readPart = (value: unknown): AssistantTransportMessagePart | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (value.type === "text" && typeof value.text === "string") {
    return { type: "text", text: value.text };
  }
  if (value.type === "tool-call" && typeof value.toolName === "string") {
    return {
      type: "tool-call",
      toolName: value.toolName,
      toolCallId: typeof value.toolCallId === "string" ? value.toolCallId : null,
      args: isRecord(value.args) ? toJsonRecord(value.args) : null,
    };
  }
  if (value.type === "tool-result" && typeof value.toolName === "string") {
    return {
      type: "tool-result",
      toolName: value.toolName,
      toolCallId: typeof value.toolCallId === "string" ? value.toolCallId : null,
      result: readJsonValue(value.result),
      isError: typeof value.isError === "boolean" ? value.isError : null,
    };
  }
  return null;
};

const toMessageFromTransport = (message: AssistantTransportMessage): Message | null => {
  const parts = toMessageParts(message.parts);
  const text = readStructuredText(parts);
  return {
    role: message.role,
    content: { text, parts },
  };
};

const toMessageParts = (parts: AssistantTransportMessagePart[]): MessagePart[] => {
  const output: MessagePart[] = [];
  for (const part of parts) {
    const mapped = toMessagePart(part);
    if (mapped) {
      output.push(mapped);
    }
  }
  return output;
};

const toMessagePart = (part: AssistantTransportMessagePart): MessagePart | null => {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  if (part.type === "tool-call") {
    return {
      type: "tool-call",
      toolCallId: part.toolCallId ?? null,
      toolName: part.toolName,
      input: part.args ?? {},
    };
  }
  if (part.type === "tool-result") {
    return {
      type: "tool-result",
      toolCallId: part.toolCallId ?? null,
      toolName: part.toolName,
      output: part.result,
      isError: part.isError ?? null,
    };
  }
  return null;
};

const toToolResultMessage = (command: AddToolResultCommand): Message => ({
  role: "tool",
  toolCallId: command.toolCallId,
  content: {
    text: "",
    parts: [
      {
        type: "tool-result",
        toolCallId: command.toolCallId,
        toolName: command.toolName ?? "tool",
        output: command.result,
        isError: command.isError ?? null,
      },
    ],
  },
});

const readStructuredText = (parts: MessagePart[]): string => {
  const textParts: string[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      textParts.push(part.text);
    }
  }
  return textParts.join("\n");
};

const readData = (value: unknown): AssistantTransportRequest["data"] => {
  if (!isRecord(value)) {
    return {};
  }
  return {
    recipeId: typeof value.recipeId === "string" ? value.recipeId : undefined,
    adapterSource: typeof value.adapterSource === "string" ? value.adapterSource : undefined,
    providerId: typeof value.providerId === "string" ? value.providerId : undefined,
    modelId: typeof value.modelId === "string" ? value.modelId : undefined,
    chatId: typeof value.chatId === "string" ? value.chatId : undefined,
  };
};

const readJsonValue = (value: unknown): JsonValue => {
  if (isJsonValue(value)) {
    return value;
  }
  return null;
};

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
};

const toJsonRecord = (value: Record<string, unknown>): Record<string, JsonValue> => {
  const result: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = readJsonValue(entry);
  }
  return result;
};
