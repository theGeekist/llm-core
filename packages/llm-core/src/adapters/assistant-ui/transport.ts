import type { AssistantTransportCommand as ExternalAssistantTransportCommand } from "@assistant-ui/react";
import type { ReadonlyJSONValue } from "assistant-stream/utils";
import type { Message, MessagePart } from "../types";
import { isRecord } from "#shared/guards";

export type JsonValue = ReadonlyJSONValue;

export type AddMessageCommand = Extract<ExternalAssistantTransportCommand, { type: "add-message" }>;

export type AddToolResultCommand = Extract<
  ExternalAssistantTransportCommand,
  { type: "add-tool-result" }
>;

export type AssistantTransportMessage = AddMessageCommand["message"];

export type AssistantTransportMessagePart = AssistantTransportMessage["parts"][number];

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
    if (
      typeof value.toolCallId !== "string" ||
      typeof value.toolName !== "string" ||
      typeof value.isError !== "boolean" ||
      !isJsonValue(value.result) ||
      (value.artifact !== undefined && !isJsonValue(value.artifact))
    ) {
      return null;
    }
    return {
      type: "add-tool-result",
      toolCallId: value.toolCallId,
      toolName: value.toolName,
      result: value.result,
      isError: value.isError,
      artifact: value.artifact,
    };
  }
  return null;
};

const readMessage = (value: unknown): AssistantTransportMessage | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (!Array.isArray(value.parts)) {
    return null;
  }
  if (value.role === "user") {
    const parts = readUserParts(value.parts);
    return parts ? { role: "user", parts } : null;
  }
  if (value.role === "assistant") {
    const parts = readAssistantParts(value.parts);
    return parts ? { role: "assistant", parts } : null;
  }
  return null;
};

type UserMessage = Extract<AssistantTransportMessage, { role: "user" }>;
type UserMessagePart = UserMessage["parts"][number];
type AssistantMessage = Extract<AssistantTransportMessage, { role: "assistant" }>;
type AssistantMessagePart = AssistantMessage["parts"][number];

const readUserParts = (value: unknown[]): UserMessage["parts"] | null => {
  const parts: UserMessagePart[] = [];
  for (const entry of value) {
    const parsed = readUserPart(entry);
    if (!parsed) {
      return null;
    }
    parts.push(parsed);
  }
  return parts;
};

const readAssistantParts = (value: unknown[]): AssistantMessage["parts"] | null => {
  const parts: AssistantMessagePart[] = [];
  for (const entry of value) {
    const parsed = readTextPart(entry);
    if (!parsed) {
      return null;
    }
    parts.push(parsed);
  }
  return parts;
};

const readUserPart = (value: unknown): UserMessagePart | null => {
  const text = readTextPart(value);
  if (text) {
    return text;
  }
  if (isRecord(value) && value.type === "image" && typeof value.image === "string") {
    return { type: "image", image: value.image };
  }
  return null;
};

const readTextPart = (value: unknown): AssistantMessagePart | null => {
  if (!isRecord(value)) {
    return null;
  }
  if (value.type === "text" && typeof value.text === "string") {
    return { type: "text", text: value.text };
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

const toMessageParts = (parts: readonly AssistantTransportMessagePart[]): MessagePart[] => {
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
  if (part.type === "image") {
    return { type: "image", url: part.image };
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
        toolName: command.toolName,
        output: command.result,
        isError: command.isError,
      },
    ],
  },
  metadata:
    command.artifact === undefined ? undefined : { assistantUi: { artifact: command.artifact } },
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
