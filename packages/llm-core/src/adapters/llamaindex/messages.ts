import type {
  ChatMessage,
  MessageContent as LlamaIndexMessageContent,
  MessageContentDetail,
  MessageType,
} from "@llamaindex/core/llms";
import type { Message, MessageContent, MessagePart } from "../types";
import { toMessageContent } from "../message-content";

type AdapterOptions = {
  adapterRole?: Message["role"];
  toolCallId?: string;
  toolName?: string;
};

const readAdapterOptions = (message: ChatMessage): AdapterOptions | null => {
  const options = message.options as AdapterOptions | undefined;
  if (!options || typeof options !== "object") {
    return null;
  }
  return options;
};

const toAdapterRole = (message: ChatMessage): Message["role"] => {
  const adapterRole = readAdapterOptions(message)?.adapterRole;
  if (adapterRole === "tool") {
    return "tool";
  }
  const role = message.role as MessageType;
  if (role === "user") {
    return "user";
  }
  if (role === "assistant") {
    return "assistant";
  }
  if (role === "system" || role === "developer" || role === "memory") {
    return "system";
  }
  return "tool";
};

const toContent = (content: ChatMessage["content"]) => toMessageContent(content);

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const summaryGenerators: Partial<Record<MessagePart["type"], (part: MessagePart) => string>> = {
  "tool-call": (part) =>
    part.type === "tool-call" ? `tool-call:${part.toolName}:${safeStringify(part.input)}` : "",
  "tool-result": (part) =>
    part.type === "tool-result" ? `tool-result:${part.toolName}:${safeStringify(part.output)}` : "",
  image: (part) => (part.type === "image" ? `image:${part.url ?? "inline"}` : ""),
  file: (part) =>
    part.type === "file" ? `file:${part.mediaType ?? "application/octet-stream"}` : "",
  data: (part) => (part.type === "data" ? safeStringify(part.data) : ""),
};

const summarizePart = (part: MessagePart) => {
  const summary = summaryGenerators[part.type];
  return summary ? summary(part) : "";
};

export function fromLlamaIndexMessage(message: ChatMessage): Message {
  const options = readAdapterOptions(message);
  return {
    role: toAdapterRole(message),
    content: toContent(message.content),
    toolCallId: options?.toolCallId,
    name: options?.toolName,
  };
}

const toLlamaIndexSummary = (part: MessagePart): MessageContentDetail | null => {
  const summary = summarizePart(part);
  return summary ? ({ type: "text", text: summary } as MessageContentDetail) : null;
};

const imagePartFromAdapter = (part: MessagePart): MessageContentDetail | null => {
  if (part.type !== "image") {
    return null;
  }
  if (part.url) {
    return { type: "image_url", image_url: { url: part.url } };
  }
  if (part.data) {
    return { type: "image", data: part.data, mimeType: part.mediaType ?? "image/png" };
  }
  return null;
};

const filePartFromAdapter = (part: MessagePart): MessageContentDetail | null => {
  if (part.type !== "file" || !part.data) {
    return null;
  }
  return {
    type: "file",
    data: part.data,
    mimeType: part.mediaType ?? "application/octet-stream",
  };
};

const textPartFromAdapter = (part: MessagePart): MessageContentDetail | null => {
  if (part.type === "text" || part.type === "reasoning") {
    return { type: "text", text: part.text } as MessageContentDetail;
  }
  return null;
};

const toLlamaIndexPart = (part: MessagePart): MessageContentDetail | null =>
  textPartFromAdapter(part) ??
  imagePartFromAdapter(part) ??
  filePartFromAdapter(part) ??
  toLlamaIndexSummary(part);

export function toLlamaIndexMessageContent(content: MessageContent): LlamaIndexMessageContent {
  if (typeof content === "string") {
    return content;
  }
  const parts = content.parts.map(toLlamaIndexPart).filter(Boolean) as MessageContentDetail[];
  return parts.length ? parts : content.text;
}

export function toLlamaIndexMessage(message: Message): ChatMessage {
  const content = toLlamaIndexMessageContent(message.content);
  if (message.role === "assistant") {
    return { role: "assistant", content };
  }
  if (message.role === "system") {
    return { role: "system", content };
  }
  if (message.role === "tool") {
    return {
      role: "assistant",
      content,
      options: {
        adapterRole: "tool",
        toolCallId: message.toolCallId,
        toolName: message.name,
      },
    };
  }
  return { role: "user", content };
}
