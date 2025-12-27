# Adapters Overview

Adapters normalize external ecosystem constructs into one consistent shape, then let workflows mix and match them.
This is the high-level entry point; the detailed contracts live in [Adapters API](/reference/adapters-api).

Related:

- [Workflow API](/reference/workflow-api)
- [Adapter Interfaces](/reference/adapters-api)
- [Packs & Recipes](/reference/packs-and-recipes)

## Quick start (value-first helpers)

Register a retriever without touching registry types:

::: tabs
== TypeScript

```ts
import { Adapter } from "#adapters";
import { Recipe } from "#recipes";

const wf = Recipe.flow("rag")
  .use(
    Adapter.retriever("custom.retriever", {
      retrieve: () => ({ documents: [] }),
    }),
  )
  .build();
```

== JavaScript

```js
import { Adapter } from "#adapters";
import { Recipe } from "#recipes";

const wf = Recipe.flow("rag")
  .use(
    Adapter.retriever("custom.retriever", {
      retrieve: () => ({ documents: [] }),
    }),
  )
  .build();
```

:::

Custom constructs (e.g., `mcp`) go into constructs:

::: tabs
== TypeScript

```ts
const plugin = Adapter.register("custom.mcp", "mcp", { client });
```

== JavaScript

```js
const plugin = Adapter.register("custom.mcp", "mcp", { client });
```

:::

## Write path (vector store)

Vector stores let you ingest or delete embeddings without reaching for raw SDKs:

::: tabs
== TypeScript

```ts
import { Adapter } from "#adapters";

const vectorStore = Adapter.vectorStore("custom.vectorStore", {
  upsert: ({ documents }) => ({ ids: documents.map((doc) => doc.id ?? "new") }),
  delete: ({ ids }) => console.log(ids),
});
```

== JavaScript

```js
import { Adapter } from "#adapters";

const vectorStore = Adapter.vectorStore("custom.vectorStore", {
  upsert: ({ documents }) => ({ ids: documents.map((doc) => doc.id ?? "new") }),
  delete: ({ ids }) => console.log(ids),
});
```

:::

## Indexing (Ingestion)

Indexers manage the synchronization between your source documents and your vector store to prevent duplication.

::: tabs
== TypeScript

```ts
import { Adapter, fromLangChainIndexing } from "#adapters";

// Note: Requires a raw LangChain vector store instance
const indexing = Adapter.indexing(
  "custom.indexing",
  fromLangChainIndexing(recordManager, langChainVectorStore),
);
```

== JavaScript

```js
import { Adapter, fromLangChainIndexing } from "#adapters";

const indexing = Adapter.indexing(
  "custom.indexing",
  fromLangChainIndexing(recordManager, vectorStore),
);
```

:::

## Query engines (LlamaIndex)

Query engines return final answers from a retriever + synthesizer pipeline:

::: tabs
== TypeScript

```ts
import { Adapter, fromLlamaIndexQueryEngine } from "#adapters";

const queryEngine = Adapter.queryEngine("custom.queryEngine", fromLlamaIndexQueryEngine(engine));
```

== JavaScript

```js
import { Adapter, fromLlamaIndexQueryEngine } from "#adapters";

const queryEngine = Adapter.queryEngine("custom.queryEngine", fromLlamaIndexQueryEngine(engine));
```

:::

## Response synthesizers (LlamaIndex)

Response synthesizers focus on combining retrieved nodes into an answer:

::: tabs
== TypeScript

```ts
import { Adapter, fromLlamaIndexResponseSynthesizer } from "#adapters";

const synthesizer = Adapter.responseSynthesizer(
  "custom.responseSynthesizer",
  fromLlamaIndexResponseSynthesizer(synthesizer),
);
```

== JavaScript

```js
import { Adapter, fromLlamaIndexResponseSynthesizer } from "#adapters";

const synthesizer = Adapter.responseSynthesizer(
  "custom.responseSynthesizer",
  fromLlamaIndexResponseSynthesizer(synthesizer),
);
```

:::

## Media models (AI SDK)

AI SDK exposes image, speech, and transcription models. Wrap them directly:

::: tabs
== TypeScript

```ts
import { Adapter, fromAiSdkSpeechModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const speech = Adapter.speech(
  "custom.speech",
  fromAiSdkSpeechModel(openai.speech("gpt-4o-mini-tts")),
);
```

== JavaScript

```js
import { Adapter, fromAiSdkSpeechModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const speech = Adapter.speech(
  "custom.speech",
  fromAiSdkSpeechModel(openai.speech("gpt-4o-mini-tts")),
);
```

:::

## Trace sinks (LangChain callbacks)

LangChain callbacks/tracers can act as trace sinks. We forward `run.start` into
`handleChainStart` and `run.end` into `handleChainEnd` / `handleChainError`
(based on `status`). We map `provider.response` into `handleLLMEnd`.
All other events are emitted as custom events.

::: tabs
== TypeScript

```ts
import { Adapter, fromLangChainCallbackHandler } from "#adapters";
import { RunCollectorCallbackHandler } from "@langchain/core/tracers/run_collector";

const handler = new RunCollectorCallbackHandler();
const trace = Adapter.trace("custom.trace", fromLangChainCallbackHandler(handler));
```

== JavaScript

```js
import { Adapter, fromLangChainCallbackHandler } from "#adapters";
import { RunCollectorCallbackHandler } from "@langchain/core/tracers/run_collector";

const handler = new RunCollectorCallbackHandler();
const trace = Adapter.trace("custom.trace", fromLangChainCallbackHandler(handler));
```

:::

## Registry (advanced)

If you need explicit provider resolution, use the registry directly:

::: tabs
== TypeScript

```ts
import { createRegistryFromDefaults } from "#adapters";

const registry = createRegistryFromDefaults();
registry.registerProvider({
  construct: "model",
  providerKey: "custom",
  id: "custom:model",
  priority: 10,
  factory: () => myModelAdapter,
});
```

== JavaScript

```js
import { createRegistryFromDefaults } from "#adapters";

const registry = createRegistryFromDefaults();
registry.registerProvider({
  construct: "model",
  providerKey: "custom",
  id: "custom:model",
  priority: 10,
  factory: () => myModelAdapter,
});
```

:::
