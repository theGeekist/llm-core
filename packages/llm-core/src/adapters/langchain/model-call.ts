import type { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ModelCall } from "../types";
import { fromLangChainMessage } from "./messages";

type LangChainMessage = HumanMessage | AIMessage | SystemMessage;

export function fromLangChainMessages(messages: LangChainMessage[]): ModelCall {
  return {
    messages: messages.map(fromLangChainMessage),
  };
}
