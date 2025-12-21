import type { ModelMessage } from "ai";
import type { AdapterMessage } from "../types";
import { toAdapterMessageContent } from "../message-content";

const toContent = (content: ModelMessage["content"]) => toAdapterMessageContent(content);

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
    return { role: "tool", content: toContent(message.content) };
  }
  return { role: "tool", content: "" };
}
