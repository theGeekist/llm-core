import type { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AdapterMessage } from "../types";
import { toAdapterMessageContent } from "../message-content";

type LangChainMessage = HumanMessage | AIMessage | SystemMessage;

const toAdapterRole = (role: string): AdapterMessage["role"] => {
  if (role === "human") {
    return "user";
  }
  if (role === "ai") {
    return "assistant";
  }
  if (role === "system") {
    return "system";
  }
  return "tool";
};

const toContent = (message: LangChainMessage) =>
  toAdapterMessageContent(message.content === undefined ? message.text : message.content);

export function fromLangChainMessage(message: LangChainMessage): AdapterMessage {
  return {
    role: toAdapterRole(message.type),
    content: toContent(message),
  };
}
