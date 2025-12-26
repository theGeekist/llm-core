# Adapters Overview

Adapters normalize external ecosystem constructs into one consistent shape, then let workflows mix and match them.
This is the high-level entry point; the detailed contracts live in [Adapters API](/reference/adapters-api).

Related:

- [Workflow API](/reference/workflow-api)
- [Adapter contracts](/reference/adapters-api)
- [Packs & Recipes](/reference/packs-and-recipes)

## Ecosystem Deep Dives (Practical Guides)

If you are looking for specific integration guides:

- **[AI SDK (Vercel)](/reference/ecosystem/ai-sdk)**: The recommended path.
- **[LangChain](/reference/ecosystem/langchain)**: For tools and retrievers.
- **[LlamaIndex](/reference/ecosystem/llamaindex)**: For vector stores and data ingestion.

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
