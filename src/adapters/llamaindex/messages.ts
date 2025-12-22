import type {
  ChatMessage,
  MessageContent,
  MessageContentDetail,
  MessageType,
} from "@llamaindex/core/llms";
import type { AdapterMessage, AdapterMessageContent, AdapterMessagePart } from "../types";
import { toAdapterMessageContent } from "../message-content";

type AdapterOptions = {
  adapterRole?: AdapterMessage["role"];
  toolCallId?: string;
  toolName?: string;
};

const readAdapterOptions = (message: ChatMessage): AdapterOptions | undefined => {
  const options = message.options as AdapterOptions | undefined;
  if (!options || typeof options !== "object") {
    return undefined;
  }
  return options;
};

const toAdapterRole = (message: ChatMessage): AdapterMessage["role"] => {
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

const toContent = (content: ChatMessage["content"]) => toAdapterMessageContent(content);

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const summaryGenerators: Record<AdapterMessagePart["type"], (part: AdapterMessagePart) => string> =
  {
    text: (part) => (part.type === "text" ? part.text : ""),
    reasoning: (part) => (part.type === "reasoning" ? part.text : ""),
    "tool-call": (part) =>
      part.type === "tool-call" ? `tool-call:${part.toolName}:${safeStringify(part.input)}` : "",
    "tool-result": (part) =>
      part.type === "tool-result"
        ? `tool-result:${part.toolName}:${safeStringify(part.output)}`
        : "",
    image: (part) => (part.type === "image" ? `image:${part.url ?? "inline"}` : ""),
    file: (part) =>
      part.type === "file" ? `file:${part.mediaType ?? "application/octet-stream"}` : "",
    data: (part) => (part.type === "data" ? safeStringify(part.data) : ""),
  };

const summarizePart = (part: AdapterMessagePart) => {
  const summary = summaryGenerators[part.type];
  return summary ? summary(part) : "";
};

export function fromLlamaIndexMessage(message: ChatMessage): AdapterMessage {
  const options = readAdapterOptions(message);
  return {
    role: toAdapterRole(message),
    content: toContent(message.content),
    toolCallId: options?.toolCallId,
    name: options?.toolName,
  };
}

const toLlamaIndexSummary = (part: AdapterMessagePart): MessageContentDetail | undefined => {
  const summary = summarizePart(part);
  return summary ? ({ type: "text", text: summary } as MessageContentDetail) : undefined;
};

const imagePartFromAdapter = (part: AdapterMessagePart): MessageContentDetail | undefined => {
  if (part.type !== "image") {
    return undefined;
  }
  if (part.url) {
    return { type: "image_url", image_url: { url: part.url } };
  }
  if (part.data) {
    return { type: "image", data: part.data, mimeType: part.mediaType ?? "image/png" };
  }
  return undefined;
};

const filePartFromAdapter = (part: AdapterMessagePart): MessageContentDetail | undefined => {
  if (part.type !== "file" || !part.data) {
    return undefined;
  }
  return {
    type: "file",
    data: part.data,
    mimeType: part.mediaType ?? "application/octet-stream",
  };
};

const textPartFromAdapter = (part: AdapterMessagePart): MessageContentDetail | undefined => {
  if (part.type === "text" || part.type === "reasoning") {
    return { type: "text", text: part.text } as MessageContentDetail;
  }
  return undefined;
};

const toLlamaIndexPart = (part: AdapterMessagePart): MessageContentDetail | undefined =>
  textPartFromAdapter(part) ??
  imagePartFromAdapter(part) ??
  filePartFromAdapter(part) ??
  toLlamaIndexSummary(part);

const toLlamaIndexContent = (content: AdapterMessageContent): MessageContent => {
  if (typeof content === "string") {
    return content;
  }
  const parts = content.parts.map(toLlamaIndexPart).filter(Boolean) as MessageContentDetail[];
  return parts.length ? parts : content.text;
};

export function toLlamaIndexMessage(message: AdapterMessage): ChatMessage {
  const content = toLlamaIndexContent(message.content);
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
