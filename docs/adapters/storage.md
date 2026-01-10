# Storage and Memory

## Concepts: State Management

Language models handle tokens, not state. Every request arrives as a fresh prompt, so if you want a conversation or a long-running workflow, you need your own way to remember things.

In `llm-core` this splits into two ideas:

1. **Memory (chat history)** – short-term context.  
   The latest messages that keep the conversation grounded.

2. **Storage (key value data)** – long-term persistence.  
   User preferences, session data, workflow snapshots, cache entries, and anything else that should survive across runs.

These concepts show up in three kinds of adapters:

- **Memory adapters** for conversation history.
- **Key value stores** for arbitrary structured data.
- **Cache adapters** that layer on top of storage to save work and cost.

The rest of this page walks through each of them and shows how they connect to AI SDK, LangChain, and LlamaIndex.

---

## 1. Memory Adapters

### Conversation history

Memory adapters offer a standard interface to `load()` past messages and `save()` new ones. Recipes, workflows, and UI layers do not need to care where messages live. They only speak to `Memory` and leave the backend choice to you.

A typical flow looks like this:

1. Read past turns from memory.
2. Build a prompt from those turns and the current user input.
3. Send the prompt to a model.
4. Append the model reply to memory.

### Choosing a memory backend

Different projects want different storage layers, so the adapter surface stays small and predictable while the backend remains flexible.

- **LangChain (`BaseListChatMessageHistory`) – widely adopted**

  LangChain ships with chat history implementations for Redis, Postgres, Mongo, DynamoDB, and many more systems. When you need chat logs in a real database, a LangChain history adapter is a strong option.

  `llm-core` plugs into that world through `fromLangChainMemory`. You connect any `BaseListChatMessageHistory` instance and immediately gain access to the same recipes, flows, and tools as other memory backends.

  Upstream reference: [`BaseListChatMessageHistory`](https://api.js.langchain.com/classes/core_chat_history.BaseListChatMessageHistory.html)

- **LlamaIndex (`BaseMemory`) – structured memory and tools**

  LlamaIndex exposes its own `BaseMemory` abstraction, tuned for its document and tool ecosystem. Through `fromLlamaIndexMemory` you can reuse that work while still writing workflows in `llm-core`.

  Upstream reference: [`BaseMemory`](https://ts.llamaindex.ai/api/classes/BaseMemory)

- **AI SDK (`MemoryProvider`) – UI-oriented memory**

  AI SDK includes a `MemoryProvider` interface for applications that lean on AI SDK primitives. `fromAiSdkMemory` allows that provider to act as a drop-in memory backend for `llm-core` as well, so a single chat history can serve both your UI and your workflows.

  This path works especially well with `assistant-ui` and other components that already speak AI SDK streams.

### Simple array memory

Small scripts and transient serverless handlers often work fine with an in-memory array of messages. In those cases you can pass messages directly to the Workflow `run()` method and skip a formal memory adapter.

Adapters become valuable once you want consistent behaviour across environments or a shared memory layer for many workflows and services.

---

## 2. Key Value Stores

### Arbitrary data

Plenty of state does not fit into a chat log. You might want to keep:

- IDs for uploaded files.
- User or tenant preferences.
- Feature flags or rollout state.
- Serialized snapshots of long workflows.
- Lightweight cache entries for models or tools.

For this kind of data, `llm-core` offers a `KVStore` interface.

```ts
type KVStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  mget(keys: string[]): Promise<unknown[]>;
  mset(entries: [key: string, value: unknown][]): Promise<void>;
};
```

Your application logic talks to `KVStore` and does not depend on a specific backend. Redis, a LangChain store, a LlamaIndex document store, or an in-memory object can all sit behind the same contract.

This makes it easier to:

- Start with local, in-memory storage during development.
- Switch to a cloud database for production.
- Share a single storage adapter across many recipes and runtimes.

### Example: Redis storage through LangChain

In many cases the easiest way to reach a production datastore is through an ecosystem you already use. For example, LangChain has mature support for Redis and other key value backends.

You can pass a LangChain `BaseStore` into the `llm-core` adapter and treat it as a `KVStore`:

::: tabs
== TypeScript

<<< @/snippets/adapters/storage-redis.ts#docs

== JavaScript

<<< @/snippets/adapters/storage-redis.js#docs

:::

This pattern keeps your workflow code stable while you tune or replace the underlying storage layer.

---

## 3. Caching

### Performance and cost

Caching allows `llm-core` to reuse the result of expensive work. Typical examples include:

- Completion calls on large models.
- Embedding operations over large batches of text.
- Tool calls that hit third-party APIs with rate limits or billing.

Rather than repeat the same operation for the same inputs, a cache stores the result once, keyed by a stable hash of inputs and parameters. Future calls look up that key and return the stored value.

### The `Cache` interface

`llm-core` uses a small `Cache` interface that can sit in front of any operation:

::: tabs
== TypeScript

<<< @/snippets/adapters/cache-memory.ts

== JavaScript

<<< @/snippets/adapters/cache-memory.js

:::

A cache implementation decides how keys are stored and which backing store to use. The surrounding code only sees a lookup surface.

### Persistent caching on top of `KVStore`

Transient in-memory cache layers help during development and short-lived runs. Once a system scales or faces rate limits, persistent caches deliver much more value.

`llm-core` can wrap a `KVStore` to provide a persistent cache:

::: tabs
== TypeScript

<<< @/snippets/adapters/cache-persistent.ts#docs

== JavaScript

<<< @/snippets/adapters/cache-persistent.js#docs

:::

This approach gives you a single storage story:

- `KVStore` handles generic key value pairs.
- Cache adapters reuse `KVStore` for long-lived entries.
- Memory adapters focus on conversation history.

---

## Supported Integrations

Storage and memory features line up with the same three ecosystems that appear elsewhere in `llm-core`: AI SDK, LangChain, and LlamaIndex. The table below shows how the concepts connect.

Each adapter factory wraps an upstream interface and exposes it as an `llm-core` capability. That means you can reuse existing infrastructure while still writing workflows against a single, consistent surface.

| Capability   | Ecosystem  | Adapter Factory               | Upstream Interface           | Deep Link                                                                                      |
| :----------- | :--------- | :---------------------------- | :--------------------------- | :--------------------------------------------------------------------------------------------- |
| **Memory**   | AI SDK     | `fromAiSdkMemory`             | `MemoryProvider`             | Experimental                                                                                   |
| **Memory**   | LangChain  | `fromLangChainMemory`         | `BaseListChatMessageHistory` | [Docs](https://api.js.langchain.com/classes/core_chat_history.BaseListChatMessageHistory.html) |
| **Memory**   | LlamaIndex | `fromLlamaIndexMemory`        | `BaseMemory`                 | [Docs](https://ts.llamaindex.ai/api/classes/BaseMemory)                                        |
| **KV Store** | LangChain  | `fromLangChainStore`          | `BaseStore`                  | [Docs](https://api.js.langchain.com/classes/core_stores.BaseStore.html)                        |
| **KV Store** | LlamaIndex | `fromLlamaIndexDocumentStore` | `BaseDocumentStore`          | [Docs](https://ts.llamaindex.ai/api/classes/BaseDocumentStore)                                 |
| **Cache**    | AI SDK     | `fromAiSdkCacheStore`         | Custom                       | –                                                                                              |
| **Cache**    | LangChain  | `fromLangChainStoreCache`     | `BaseStore`                  | [Docs](https://api.js.langchain.com/classes/core_stores.BaseStore.html)                        |
| **Cache**    | LlamaIndex | `fromLlamaIndexKVStoreCache`  | `BaseKVStore`                | [Docs](https://ts.llamaindex.ai/api/classes/BaseKVStore)                                       |

With these adapters in place, you can treat storage and memory as shared infrastructure across many workflows, frameworks, and UI layers, while still staying inside the same `llm-core` mental model.
