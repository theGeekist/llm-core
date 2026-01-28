import type { ChatMessage } from "@llamaindex/core/llms";
import type { ModelCall } from "../types";
import { fromLlamaIndexMessage } from "./messages";

export function fromLlamaIndexMessages(messages: ChatMessage[]): ModelCall {
  return {
    messages: messages.map(fromLlamaIndexMessage),
  };
}
