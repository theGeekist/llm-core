import type { UIMessage } from "ai";
import type { Message } from "../../../src/adapters/types";
import { fromAiSdkMessages } from "../../../src/adapters/ai-sdk";

export const toCoreMessages = (messages: UIMessage[]): Message[] => fromAiSdkMessages(messages);
