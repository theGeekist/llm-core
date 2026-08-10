import {
  conversationId,
  type ConversationMessage,
  type ConversationStore,
} from "@geekist/llm-core/memory";
import { newCoreId, type InvocationContext, type InvocationId } from "@geekist/llm-core/contracts";
import { jsonStorageValue, type CacheStore } from "@geekist/llm-core/storage";

declare const cache: CacheStore;
declare const conversations: ConversationStore;
const message: ConversationMessage = {
  role: "user",
  content: [{ kind: "text", text: "Remember this." }],
  occurredAt: new Date().toISOString(),
};

const context: InvocationContext = {
  invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01"),
};
const id = conversationId("018f0f4e-8c5b-7a91-8c3b-123456789c02");

await cache.set({
  context,
  key: "tenant-a:answer",
  value: jsonStorageValue({ answer: 42 }),
  ttlMs: 60_000,
});

await conversations.append({
  context,
  conversationId: id,
  turn: message,
});
