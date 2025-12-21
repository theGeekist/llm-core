import type { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AdapterModelCall } from "../types";
import { fromLangChainMessage } from "./messages";

type LangChainMessage = HumanMessage | AIMessage | SystemMessage;

export function fromLangChainMessages(messages: LangChainMessage[]): AdapterModelCall {
  return {
    messages: messages.map(fromLangChainMessage),
  };
}
