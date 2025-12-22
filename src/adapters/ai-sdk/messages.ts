import type { ModelMessage } from "ai";
import type { AdapterMessage, AdapterMessageContent, AdapterMessagePart } from "../types";
import { toAdapterMessageContent } from "../message-content";

const toContent = (content: ModelMessage["content"]) => toAdapterMessageContent(content);

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

const toUserPart = (part: AdapterMessagePart): UserPart | undefined => {
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
    return toFilePart(part.data ?? "", part.mediaType);
  }
  return undefined;
};

type ToolResultOutput = Extract<ToolPart, { type: "tool-result" }>["output"];
const toToolResultOutput = (value: unknown): ToolResultOutput => value as ToolResultOutput;

const readToolMetadata = (content: ModelMessage["content"]) => {
  if (!Array.isArray(content)) {
    return undefined;
  }
  const result = content.find(
    (part): part is ToolPart => typeof part === "object" && part?.type === TOOL_RESULT_TYPE,
  );
  if (!result) {
    return undefined;
  }
  return {
    toolCallId: result.toolCallId,
    toolName: result.toolName,
  };
};

const parseAssistantText = (part: AdapterMessagePart): AssistantPart | undefined =>
  part.type === "text" ? { type: "text", text: part.text } : undefined;

const parseAssistantImage = (part: AdapterMessagePart): AssistantPart | undefined =>
  part.type === "image" ? toFilePart(part.data ?? part.url ?? "", part.mediaType) : undefined;

const parseAssistantFile = (part: AdapterMessagePart): AssistantPart | undefined =>
  part.type === "file" ? toFilePart(part.data ?? "", part.mediaType) : undefined;

const parseAssistantReasoning = (part: AdapterMessagePart): AssistantPart | undefined =>
  part.type === "reasoning" ? { type: "reasoning", text: part.text } : undefined;

const parseAssistantToolCall = (part: AdapterMessagePart): AssistantPart | undefined =>
  part.type === "tool-call"
    ? {
        type: "tool-call",
        toolCallId: part.toolCallId ?? "",
        toolName: part.toolName,
        input: part.input,
      }
    : undefined;

const parseAssistantToolResult = (part: AdapterMessagePart): AssistantPart | undefined =>
  part.type === "tool-result"
    ? {
        type: TOOL_RESULT_TYPE,
        toolCallId: part.toolCallId ?? "",
        toolName: part.toolName,
        output: part.output as ToolResultOutput,
      }
    : undefined;

const assistantPartParsers = [
  parseAssistantText,
  parseAssistantImage,
  parseAssistantFile,
  parseAssistantReasoning,
  parseAssistantToolCall,
  parseAssistantToolResult,
];

const toAssistantPart = (part: AdapterMessagePart): AssistantPart | undefined => {
  for (const parser of assistantPartParsers) {
    const parsed = parser(part);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
};

const toUserContent = (content: AdapterMessageContent): UserContent => {
  if (typeof content === "string") {
    return content;
  }
  const parts = content.parts.map(toUserPart).filter(Boolean) as UserPart[];
  if (parts.length) {
    return parts;
  }
  return content.text;
};

const toAssistantContent = (content: AdapterMessageContent): AssistantContent => {
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

const toAiSdkToolContent = (message: AdapterMessage): ToolContent => {
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

export function fromAiSdkMessage(message: ModelMessage): AdapterMessage {
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

export function toAiSdkMessage(message: AdapterMessage): ModelMessage {
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
