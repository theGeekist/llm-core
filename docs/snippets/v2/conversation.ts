import { createConversation, type ConversationEvent } from "@geekist/llm-core/conversation";
import type { Agent } from "@geekist/llm-core/agent";
import type { ConversationStore } from "@geekist/llm-core/interaction";

declare const agent: Agent;
declare const store: ConversationStore;
declare const render: (event: ConversationEvent) => void;

const conversation = createConversation({ agent, store });

for await (const event of conversation.stream("Hello")) {
  render(event);
}
