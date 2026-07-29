# Storage and memory

Storage ports describe host-owned persistence without choosing a database.
Conversation memory is a separate portable contract layered over those
storage concerns.

```ts
import {
  conversationId,
  jsonStorageValue,
  type CacheStore,
  type ConversationStore,
} from "@geekist/llm-core/agent";
import {
  newCoreId,
  type ConversationId,
  type InvocationContext,
  type InvocationId,
} from "@geekist/llm-core/contracts";

declare const cache: CacheStore;
declare const conversations: ConversationStore;

const context: InvocationContext = {
  invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01"),
};
const id = conversationId(newCoreId<ConversationId>("018f0f4e-8c5b-7a91-8c3b-123456789c02"));

await cache.set(context, {
  key: "tenant-a:answer",
  value: jsonStorageValue({ answer: 42 }),
  ttlMs: 60_000,
});

await conversations.append(context, id, {
  role: "user",
  content: [{ kind: "text", text: "Remember this." }],
  occurredAt: new Date().toISOString(),
});
```

`CacheStore` is TTL-oriented, `KeyValueStore` is batched named storage, and
`ResourceStore` owns live bytes behind portable `ResourceRef` values.
`ConversationStore` owns ordered turns; `ConversationStateStore` owns
application state derived for a conversation. None of these ports expose
credentials, database handles or provider-native messages.

Validate values before persistence. Sensitive-looking portable keys and
strings are rejected by the registration helpers, and native data must be
redacted and namespaced before it reaches portable state or evidence.
