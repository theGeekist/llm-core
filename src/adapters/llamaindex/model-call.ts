import type { ChatMessage } from "@llamaindex/core/llms";
import type { AdapterModelCall } from "../types";
import { fromLlamaIndexMessage } from "./messages";

export function fromLlamaIndexMessages(messages: ChatMessage[]): AdapterModelCall {
  return {
    messages: messages.map(fromLlamaIndexMessage),
  };
}
