import type { ModelMessage } from "ai";
import type { Message, MessageContent, MessagePart } from "../types";
import { toMessageContent } from "../message-content";

const toContent = (content: ModelMessage["content"]) => toMessageContent(content);

const TOOL_RESULT_TYPE = "tool-result";
const DEFAULT_MEDIA_TYPE = "application/octet-stream";

type SystemContent = Extract<ModelMessage, { role: "system" }>["content"];
type UserContent = Extract<ModelMessage, { role: "user" }>["content"];
type AssistantContent = Extract<ModelMessage, { role: "assistant" }>["content"];
type ToolContent = Extract<ModelMessage, { role: "tool" }>["content"];
type UserPart = Exclude<UserContent, string>[number];
type AssistantPart = Exclude<AssistantContent, string>[number];
type ToolPart = Exclude<ToolContent, string>[number];

const toFilePart = (data: string, mediaType?: string) => ({
  type: "file" as const,
  data,
  mediaType: mediaType ?? DEFAULT_MEDIA_TYPE,
});

const toUserPart = (part: MessagePart): UserPart | null | undefined => {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  if (part.type === "image") {
    return {
      type: "image",
      image: part.url ?? part.data ?? "",
    };
  }
  if (part.type === "file") {
    return toFilePart(part.data ?? "", part.mediaType ?? undefined);
  }
  return null;
};

type ToolResultOutput = Extract<ToolPart, { type: "tool-result" }>["output"];
const toToolResultOutput = (value: unknown): ToolResultOutput => value as ToolResultOutput;

const readToolMetadata = (content: ModelMessage["content"]) => {
  if (!Array.isArray(content)) {
    return null;
  }
  const result = content.find(
    (part): part is ToolPart => typeof part === "object" && part?.type === TOOL_RESULT_TYPE,
  );
  if (!result) {
    return null;
  }
  return {
    toolCallId: result.toolCallId,
    toolName: result.toolName,
  };
};

const parseAssistantText = (part: MessagePart): AssistantPart | null | undefined =>
  part.type === "text" ? { type: "text", text: part.text } : null;

const parseAssistantImage = (part: MessagePart): AssistantPart | null | undefined =>
  part.type === "image"
    ? toFilePart(part.data ?? part.url ?? "", part.mediaType ?? undefined)
    : null;

const parseAssistantFile = (part: MessagePart): AssistantPart | null | undefined =>
  part.type === "file" ? toFilePart(part.data ?? "", part.mediaType ?? undefined) : null;

const parseAssistantReasoning = (part: MessagePart): AssistantPart | null | undefined =>
  part.type === "reasoning" ? { type: "reasoning", text: part.text } : null;

const parseAssistantToolCall = (part: MessagePart): AssistantPart | null | undefined =>
  part.type === "tool-call"
    ? {
        type: "tool-call",
        toolCallId: part.toolCallId ?? "",
        toolName: part.toolName,
        input: part.input,
      }
    : null;

const parseAssistantToolResult = (part: MessagePart): AssistantPart | null | undefined =>
  part.type === "tool-result"
    ? {
        type: TOOL_RESULT_TYPE,
        toolCallId: part.toolCallId ?? "",
        toolName: part.toolName,
        output: part.output as ToolResultOutput,
      }
    : null;

const assistantPartParsers = [
  parseAssistantText,
  parseAssistantImage,
  parseAssistantFile,
  parseAssistantReasoning,
  parseAssistantToolCall,
  parseAssistantToolResult,
];

const toAssistantPart = (part: MessagePart): AssistantPart | null | undefined => {
  for (const parser of assistantPartParsers) {
    const parsed = parser(part);
    if (parsed) {
      return parsed;
    }
  }
  return null;
};

const toUserContent = (content: MessageContent): UserContent => {
  if (typeof content === "string") {
    return content;
  }
  const parts = content.parts.map(toUserPart).filter(Boolean) as UserPart[];
  if (parts.length) {
    return parts;
  }
  return content.text;
};

const toAssistantContent = (content: MessageContent): AssistantContent => {
  if (typeof content === "string") {
    return content;
  }
  const parts = content.parts.map(toAssistantPart).filter(Boolean) as AssistantPart[];
  if (parts.length) {
    return parts;
  }
  return content.text;
};

const DEFAULT_TOOL_NAME = "tool";

const toAiSdkToolContent = (message: Message): ToolContent => {
  const content = message.content;
  const fallbackToolCallId = message.toolCallId ?? DEFAULT_TOOL_NAME;
  const fallbackToolName = message.name ?? DEFAULT_TOOL_NAME;

  if (typeof content === "string") {
    return [
      {
        type: TOOL_RESULT_TYPE,
        toolCallId: fallbackToolCallId,
        toolName: fallbackToolName,
        output: toToolResultOutput(content),
      },
    ];
  }
  const toolParts = content.parts
    .map(toAssistantPart)
    .filter((part): part is ToolPart => part?.type === TOOL_RESULT_TYPE);
  if (toolParts.length) {
    return toolParts.map((part) => ({
      ...part,
      toolCallId: part.toolCallId || fallbackToolCallId,
      toolName: part.toolName || fallbackToolName,
      output: toToolResultOutput(part.output),
    })) as ToolContent;
  }
  return [
    {
      type: TOOL_RESULT_TYPE,
      toolCallId: fallbackToolCallId,
      toolName: fallbackToolName,
      output: toToolResultOutput(content.text),
    },
  ];
};

export function fromAiSdkMessage(message: ModelMessage): Message {
  if (message.role === "system") {
    return { role: "system", content: toContent(message.content) };
  }
  if (message.role === "user") {
    return { role: "user", content: toContent(message.content) };
  }
  if (message.role === "assistant") {
    return { role: "assistant", content: toContent(message.content) };
  }
  if ("content" in message) {
    const content = toContent(message.content);
    const toolMeta = readToolMetadata(message.content);
    return {
      role: "tool",
      content,
      toolCallId: toolMeta?.toolCallId,
      name: toolMeta?.toolName,
    };
  }
  return { role: "tool", content: "" };
}

export function toAiSdkMessage(message: Message): ModelMessage {
  if (message.role === "system") {
    const content: SystemContent =
      typeof message.content === "string" ? message.content : message.content.text;
    return { role: "system", content };
  }
  if (message.role === "assistant") {
    return { role: "assistant", content: toAssistantContent(message.content) };
  }
  if (message.role === "tool") {
    return { role: "tool", content: toAiSdkToolContent(message) };
  }
  return { role: "user", content: toUserContent(message.content) };
}
