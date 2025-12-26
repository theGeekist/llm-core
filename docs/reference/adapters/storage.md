# Storage & Memory (Persistence)

## Concepts: State Management

LLMs are stateless. They don't remember you. To build a conversation, you need to manage state in two ways:

1.  **Memory (Chat History)**: Short-term context. "What did we just talk about?"
2.  **Storage (Key-Value)**: Long-term persistence. User preferences, session data, or cached results.

---

## 1. Memory Adapters

**Conversation History**

Memory adapters provide a standard interface to `load()` past messages and `save()` new ones.

### When to use what?

- **LangChain (`BaseListChatMessageHistory`)**: **The Industry Standard.**
  LangChain has adapters for **Redis**, **Postgres**, **Mongo**, **DynamoDB**, and dozens more. If you need to save chat logs to a real database, use a LangChain history adapter.

  - _Upstream Docs_: [`BaseListChatMessageHistory`](https://api.js.langchain.com/classes/core_chat_history.BaseListChatMessageHistory.html)

- **In-Memory (Simple)**:
  For quick scripts or stateless serverless functions, you might just pass an array of messages directly to the Workflow `run()` method. You don't always _need_ an adapter.

---

## 2. Key-Value Stores

**Arbitrary Data**

Sometimes you need to save more than just messages—like a user's uploaded PDF ID, a session token, or a serialized workflow state.

- **Interface**: `KVStore`
- **Why use it?**: It abstracts the backend. You can write your logic against `store.get(key)` and swap Redis for In-Memory for S3 without changing your business logic.

### Example: Redis Storage

We recommend passing LangChain Stores into our adapter.

::: tabs
== TypeScript

```ts
import { fromLangChainStore } from "@geekist/llm-core/adapters";
import type { KVStore } from "@geekist/llm-core/adapters";
import { RedisStore } from "@langchain/redis";
import { createClient } from "redis";

const client = createClient({ url: "redis://localhost:6379" });
const store: KVStore = fromLangChainStore(new RedisStore({ client }));

// Store arbitrary session data
await store.set("user:123:preferences", { theme: "dark" });
```

== JavaScript

```js
import { fromLangChainStore } from "@geekist/llm-core/adapters";
import { RedisStore } from "@langchain/redis";
import { createClient } from "redis";

const client = createClient({ url: "redis://localhost:6379" });
const store = fromLangChainStore(new RedisStore({ client }));

// Store arbitrary session data
await store.set("user:123:preferences", { theme: "dark" });
```

:::

---

## 3. Caching

**Performance & Cost Savings**

Caching allows `llm-core` to remember the result of an expensive operation (like a GPT-4 generation or a long embedding) and return it instantly next time.

### How it works

We utilize a simple `Cache` interface that can sit in front of any operation.

::: tabs
== TypeScript

```ts
import { createMemoryCache } from "@geekist/llm-core/adapters";
import type { Cache } from "@geekist/llm-core/adapters";

// 1. Create a cache (TTL = 60 seconds)
const cache: Cache = createMemoryCache({ ttl: 60_000 });

// 2. Use it in a workflow (example conceptual usage)
// The workflow engine checks this cache before calling the model
```

== JavaScript

```js
import { createMemoryCache } from "@geekist/llm-core/adapters";

// 1. Create a cache (TTL = 60 seconds)
const cache = createMemoryCache({ ttl: 60_000 });

// 2. Use it in a workflow (example conceptual usage)
// The workflow engine checks this cache before calling the model
```

:::

We also support **Persistent Caching** by wrapping a `KVStore`:

::: tabs
== TypeScript

```ts
import { createCacheFromKVStore, fromLangChainStore } from "@geekist/llm-core/adapters";
import type { Cache } from "@geekist/llm-core/adapters";
import { RedisStore } from "@langchain/redis";

// Turn a Redis connection into a robust cache
const redisCache: Cache = createCacheFromKVStore(
  fromLangChainStore(new RedisStore({ ... }))
);
```

== JavaScript

```js
import { createCacheFromKVStore, fromLangChainStore } from "@geekist/llm-core/adapters";
import { RedisStore } from "@langchain/redis";

// Turn a Redis connection into a robust cache
const redisCache = createCacheFromKVStore(
  fromLangChainStore(new RedisStore({ ... }))
);
```

:::

---

## Supported Integrations (Flex)

| Capability   | Ecosystem  | Adapter Factory               | Upstream Interface           | Deep Link                                                                                      |
| :----------- | :--------- | :---------------------------- | :--------------------------- | :--------------------------------------------------------------------------------------------- |
| **Memory**   | AI SDK     | `fromAiSdkMemory`             | `MemoryProvider`             | (Experimental)                                                                                 |
| **Memory**   | LangChain  | `fromLangChainMemory`         | `BaseListChatMessageHistory` | [Docs](https://api.js.langchain.com/classes/core_chat_history.BaseListChatMessageHistory.html) |
| **Memory**   | LlamaIndex | `fromLlamaIndexMemory`        | `BaseMemory`                 | [Docs](https://ts.llamaindex.ai/api/classes/BaseMemory)                                        |
| **KV Store** | LangChain  | `fromLangChainStore`          | `BaseStore`                  | [Docs](https://api.js.langchain.com/classes/core_stores.BaseStore.html)                        |
| **KV Store** | LlamaIndex | `fromLlamaIndexDocumentStore` | `BaseDocumentStore`          | [Docs](https://ts.llamaindex.ai/api/classes/BaseDocumentStore)                                 |
| **Cache**    | AI SDK     | `fromAiSdkCacheStore`         | (Custom)                     | -                                                                                              |
| **Cache**    | LangChain  | `fromLangChainStoreCache`     | `BaseStore`                  | [Docs](https://api.js.langchain.com/classes/core_stores.BaseStore.html)                        |
| **Cache**    | LlamaIndex | `fromLlamaIndexKVStoreCache`  | `BaseKVStore`                | [Docs](https://ts.llamaindex.ai/api/classes/BaseKVStore)                                       |
