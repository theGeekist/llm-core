import type { UIMessage } from "ai";
import { fromAiSdkMessages, type Message } from "@geekist/llm-core/adapters";

export const toCoreMessages = (messages: UIMessage[]): Message[] => fromAiSdkMessages(messages);
