import type { ChatMessage } from "@llamaindex/core/llms";
import type { Memory } from "@llamaindex/core/memory";

export type LlamaIndexChatMessage = ChatMessage;
export type LlamaIndexMemory = Pick<Memory, "add" | "clear" | "getLLM">;
