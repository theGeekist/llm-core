import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { Message, MessageContent, MessagePart } from "../types";
import { toMessageContent } from "../message-content";

type LangChainMessage = HumanMessage | AIMessage | SystemMessage | ToolMessage;

const toAdapterRole = (role: string): Message["role"] => {
  if (role === "human") {
    return "user";
  }
  if (role === "ai") {
    return "assistant";
  }
  if (role === "system") {
    return "system";
  }
  if (role === "tool") {
    return "tool";
  }
  return "tool";
};

const toContent = (message: LangChainMessage) =>
  toMessageContent(message.content === undefined ? message.text : message.content);

type LangChainContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

const DEFAULT_IMAGE_MEDIA = "image/png";

const toDataUrl = (data: string, mediaType?: string) =>
  `data:${mediaType ?? DEFAULT_IMAGE_MEDIA};base64,${data}`;

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const summarizePart = (part: MessagePart) => {
  if (part.type === "text") {
    return part.text;
  }
  if (part.type === "reasoning") {
    return part.text;
  }
  if (part.type === "tool-call") {
    return `tool-call:${part.toolName}:${safeStringify(part.input)}`;
  }
  if (part.type === "tool-result") {
    return `tool-result:${part.toolName}:${safeStringify(part.output)}`;
  }
  if (part.type === "image") {
    return `image:${part.url ?? "inline"}`;
  }
  if (part.type === "file") {
    return `file:${part.mediaType ?? "application/octet-stream"}`;
  }
  if (part.type === "data") {
    return safeStringify(part.data);
  }
  return "";
};

const toLangChainPart = (part: MessagePart): LangChainContentPart | undefined => {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  if (part.type === "image") {
    if (part.url) {
      return { type: "image_url", image_url: { url: part.url } };
    }
    if (part.data) {
      return {
        type: "image_url",
        image_url: { url: toDataUrl(part.data, part.mediaType ?? undefined) },
      };
    }
  }
  const fallback = summarizePart(part);
  return fallback ? { type: "text", text: fallback } : undefined;
};

const toPlainText = (content: MessageContent) => {
  if (typeof content === "string") {
    return content;
  }
  if (content.text) {
    return content.text;
  }
  return content.parts.map(summarizePart).filter(Boolean).join("\n");
};

export function fromLangChainMessage(message: LangChainMessage): Message {
  if (ToolMessage.isInstance(message)) {
    return {
      role: "tool",
      content: toContent(message),
      toolCallId: message.tool_call_id,
      name: message.name ?? undefined,
    };
  }
  return {
    role: toAdapterRole(message.type),
    content: toContent(message),
  };
}

const toLangChainContent = (content: MessageContent) => {
  if (typeof content === "string") {
    return content;
  }
  const parts = content.parts.map(toLangChainPart).filter(Boolean) as LangChainContentPart[];
  if (parts.length) {
    return parts;
  }
  return content.text;
};

export function toLangChainMessage(message: Message): LangChainMessage {
  const content = toLangChainContent(message.content);
  if (message.role === "assistant") {
    return new AIMessage(content);
  }
  if (message.role === "system") {
    return new SystemMessage(content);
  }
  if (message.role === "tool") {
    return new ToolMessage({
      content: toPlainText(message.content),
      tool_call_id: message.toolCallId ?? "tool",
      name: message.name ?? undefined,
    });
  }
  return new HumanMessage(content);
}
