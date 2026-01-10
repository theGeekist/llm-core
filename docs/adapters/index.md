# Adapters Overview

Adapters bring external ecosystem constructs into a consistent shape so that workflows can combine them freely. This page gives the high-level view, and the detailed contracts live in [Adapters API](/reference/adapters-api).

Related docs: [Adapter Interfaces](/reference/adapters-api) and [Composition Model](/reference/composition-model).

## Quick start: value-first helpers

You can register a retriever in a single place and let the registry handle the wiring.

::: tabs
== TypeScript

<<< @/snippets/adapters/quick-start.ts#docs

== JavaScript

<<< @/snippets/adapters/quick-start.js#docs

:::

Custom constructs, such as `mcp`, belong in the constructs layer.

::: tabs
== TypeScript

<<< @/snippets/adapters/constructs.ts#docs

== JavaScript

<<< @/snippets/adapters/constructs.js#docs

:::

## Cross-ecosystem coverage

Adapters do more than hide SDK details. They sit between three major JavaScript ecosystems, AI SDK, LangChain, and LlamaIndex, and let you compose them inside a single workflow.

Through these SDKs you can reach cloud providers such as OpenAI and Anthropic, local engines such as Ollama, and other back ends that plug into those ecosystems. The adapter layer focuses on behaviour and presents each feature through a shared vocabulary.

Each ecosystem brings its own class names and helper functions. Adapters normalise these surfaces into constructs such as Model, Embedder, Retriever, VectorStore, Memory, Tool, and a small group of media, storage, and tracing types. Recipes use these constructs directly and treat the underlying SDK and provider as an implementation detail.

A single workflow run can call an AI SDK chat model, delegate retrieval to a LangChain retriever or vector store, let a LlamaIndex response synthesiser shape the final answer, and send trace events into LangChain or LlamaIndex tracing hooks. The table gives a quick sense of that coverage.

| Capability            | AI SDK                                      | LangChain                                  | LlamaIndex                                                  |
| --------------------- | ------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Models and embeddings | Models, embeddings, rerankers               | Models, embeddings, rerankers              | Models, embeddings, rerankers                               |
| Retrieval and RAG     | Uses retrievers and stores through adapters | Native retrievers and chains               | Native retrievers, query engines, and response synthesizers |
| Vector stores         | Uses LangChain or LlamaIndex vector stores  | Vector store surface                       | Vector store and record manager                             |
| Memory and cache      | Working memory and cache helpers            | Memory, chat history, caches, and stores   | Memory, key value stores, and checkpoints                   |
| Media models          | Image, speech, and transcription models     | Media through tools around chat models     | Media through tools and multimodal models                   |
| UI and tracing        | UI streams and transports                   | Trace sinks through callbacks and handlers | Workflow trace plugins and event streams                    |

For a complete catalogue of constructs, SDK modules, and provider surfaces across these ecosystems, see the [Interop Audit](/reference/interop-audit). The audit lists every mapped shape. This overview page keeps the story short and focused.

## Effect return semantics

Effectful adapter operations use `MaybePromise<boolean | null>` as a common return type. `MaybePromise` behaves like a value that can arrive immediately in synchronous code or later from an asynchronous call.

These operations rely on three return values: `true` for success, `false` for a handled failure such as validation issues, missing inputs, or an upstream error, and `null` for an intentional skip when a cache entry stays unchanged or a capability stays idle for the current call.

Cache, Stores, Memory, Checkpoint & Event-stream emissions and Tracesll follow this pattern.

## Write path for vector stores

Vector stores allow you to ingest or delete embeddings through a single adapter surface instead of working with each SDK on its own.

::: tabs
== TypeScript

<<< @/snippets/adapters/vector-store.ts#docs

== JavaScript

<<< @/snippets/adapters/vector-store.js#docs

:::

## Indexing and ingestion

Indexers manage synchronization between source documents and a vector store so that the same content does not appear multiple times.

::: tabs
== TypeScript

<<< @/snippets/adapters/indexing.ts#docs

== JavaScript

<<< @/snippets/adapters/indexing.js#docs

:::

## Query engines with LlamaIndex

Query engines couple a retriever with a response synthesizer to return a final answer that already reflects both retrieval and synthesis.

::: tabs
== TypeScript

<<< @/snippets/adapters/query-engine.ts#docs

== JavaScript

<<< @/snippets/adapters/query-engine.js#docs

:::

## Response synthesizers with LlamaIndex

Response synthesizers focus on taking retrieved nodes and turning them into an answer that is ready for the user or the next pipeline step.

::: tabs
== TypeScript

<<< @/snippets/adapters/response-synthesizer.ts#docs

== JavaScript

<<< @/snippets/adapters/response-synthesizer.js#docs

:::

## Media models with the AI SDK

The AI SDK exposes image, speech, and transcription models. You can wrap these models directly as adapters and keep them aligned with the rest of the workflow.

::: tabs
== TypeScript

<<< @/snippets/adapters/media.ts#docs

== JavaScript

<<< @/snippets/adapters/media.js#docs

:::

## UI SDK adapters

Interaction adapters also bridge the runtime into UI libraries. Interaction Core emits a stream of `InteractionEvent` values. UI adapters translate this stream into the formats used by AI SDK UI, Assistant UI, NLUX, and OpenAI ChatKit. The runtime logic stays inside the workflow layer and each UI focuses on layout, styling, and user input.

AI SDK UI receives a `UIMessage` stream that works with helpers such as `useChat`. Assistant UI reads a structured command stream that fits `useAssistant` and related hooks. NLUX receives a chat adapter object with batch and streaming calls. ChatKit listens for custom events on a target element and passes them into its web components.

The [UI SDK Adapters](/adapters/ui-sdk) page describes each bridge and shows complete examples. UI SDK bridges follow a `*-ui` suffix, for example `ai-sdk-ui`. Each bridge behaves like any other adapter and specialises in UI transport so that the adapter surface stays flat.

## Trace sinks with LangChain callbacks

LangChain callbacks and tracers can act as trace sinks. The system forwards `run.start` into `handleChainStart` and `run.end` into `handleChainEnd` or `handleChainError`, depending on the status. It maps `provider.response` into `handleLLMEnd`. All other events appear as custom events.

::: tabs
== TypeScript

<<< @/snippets/adapters/trace.ts#docs

== JavaScript

<<< @/snippets/adapters/trace.js#docs

:::

## Registry for advanced use

When you need explicit provider resolution, work with the registry directly.

::: tabs
== TypeScript

<<< @/snippets/adapters/registry.ts#docs

== JavaScript

<<< @/snippets/adapters/registry.js#docs

:::
