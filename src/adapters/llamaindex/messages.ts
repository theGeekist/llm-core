import type { ChatMessage, MessageType } from "@llamaindex/core/llms";
import type { AdapterMessage } from "../types";
import { toAdapterMessageContent } from "../message-content";

const toAdapterRole = (role: MessageType): AdapterMessage["role"] => {
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

export function fromLlamaIndexMessage(message: ChatMessage): AdapterMessage {
  return {
    role: toAdapterRole(message.role),
    content: toContent(message.content),
  };
}
