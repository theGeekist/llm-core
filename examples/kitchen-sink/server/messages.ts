import type { UIMessage } from "ai";
import type { Message } from "@geekist/llm-core/adapters";
import { fromAiSdkMessages } from "@geekist/llm-core/adapters/ai-sdk";

export const toCoreMessages = (messages: UIMessage[]): Message[] => fromAiSdkMessages(messages);
