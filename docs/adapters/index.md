# Adapters Overview

Adapters normalize external ecosystem constructs into one consistent shape, then let workflows mix and match them.
This is the high-level entry point; the detailed contracts live in [Adapters API](/reference/adapters-api).

Related:

- [Adapter Interfaces](/reference/adapters-api)
- [Composition Model](/reference/composition-model)

## Quick start (value-first helpers)

Register a retriever without touching registry types:

::: tabs
== TypeScript

<<< @/snippets/adapters/quick-start.ts

== JavaScript

<<< @/snippets/adapters/quick-start.js

:::

Custom constructs (e.g., `mcp`) go into constructs:

::: tabs
== TypeScript

<<< @/snippets/adapters/constructs.ts

== JavaScript

<<< @/snippets/adapters/constructs.js

:::

## Effect return semantics

Effectful adapter operations return `MaybePromise<boolean | null>`:

- `true`: the operation succeeded.
- `false`: the operation failed (validation errors, missing inputs, or upstream failure).
- `null`: not applicable (capability not supported or intentionally skipped).

This applies to cache/storage writes and deletes, memory writes, checkpoint/event-stream/trace emits, and
vector store deletes.

## Write path (vector store)

Vector stores let you ingest or delete embeddings without reaching for raw SDKs:

::: tabs
== TypeScript

<<< @/snippets/adapters/vector-store.ts#docs

== JavaScript

<<< @/snippets/adapters/vector-store.js#docs

:::

## Indexing (Ingestion)

Indexers manage the synchronization between your source documents and your vector store to prevent duplication.

::: tabs
== TypeScript

<<< @/snippets/adapters/indexing.ts#docs

== JavaScript

<<< @/snippets/adapters/indexing.js#docs

:::

## Query engines (LlamaIndex)

Query engines return final answers from a retriever + synthesizer pipeline:

::: tabs
== TypeScript

<<< @/snippets/adapters/query-engine.ts#docs

== JavaScript

<<< @/snippets/adapters/query-engine.js#docs

:::

## Response synthesizers (LlamaIndex)

Response synthesizers focus on combining retrieved nodes into an answer:

::: tabs
== TypeScript

<<< @/snippets/adapters/response-synthesizer.ts#docs

== JavaScript

<<< @/snippets/adapters/response-synthesizer.js#docs

:::

## Media models (AI SDK)

AI SDK exposes image, speech, and transcription models. Wrap them directly:

::: tabs
== TypeScript

<<< @/snippets/adapters/media.ts#docs

== JavaScript

<<< @/snippets/adapters/media.js#docs

:::

## UI SDK adapters

Stream Interaction Core output into UI SDKs (AI SDK first) without mixing UI concerns into core:

- [UI SDK Adapters](/adapters/ui-sdk)

UI SDK bridges follow a `*-ui` suffix (for example, `ai-sdk-ui`). They are still adapters, just for
UI transports. This keeps the adapter surface flat while signaling intent.

## Trace sinks (LangChain callbacks)

LangChain callbacks/tracers can act as trace sinks. We forward `run.start` into
`handleChainStart` and `run.end` into `handleChainEnd` / `handleChainError`
(based on `status`). We map `provider.response` into `handleLLMEnd`.
All other events are emitted as custom events.

::: tabs
== TypeScript

<<< @/snippets/adapters/trace.ts

== JavaScript

<<< @/snippets/adapters/trace.js

:::

## Registry (advanced)

If you need explicit provider resolution, use the registry directly:

::: tabs
== TypeScript

<<< @/snippets/adapters/registry.ts

== JavaScript

<<< @/snippets/adapters/registry.js

:::
