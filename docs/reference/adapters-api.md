# Adapter API (Interfaces & Helpers)

Adapters are how llm-core keeps the ecosystem from leaking into your app.
Most users never need this page because recipes and workflows already ship with adapters wired in.
You only come here when you want to integrate a new provider, bridge an external SDK, or take full control.

> [!IMPORTANT] > **Don't start here.** If you just want to use OpenAI, LangChain, or LlamaIndex, browse the **[Adapters Overview](/reference/adapters)** by capability.

Adapters exist to contain ecosystem differences, not expose them. They normalize wildly different concepts
(models, tools, retrievers, messages, schemas) into a stable internal shape while keeping provider details
available for diagnostics and tracing.

Related:

- [Workflow API](/reference/workflow-api)
- [Packs & Recipes](/reference/packs-and-recipes)
- [Runtime channel](/reference/runtime)
- [Interop Audit](/reference/interop-audit) (Parity Matrix)

## Adapter bundle (resolved on a workflow)

This is primarily useful for validation, debugging, and tooling but not day‑to‑day workflow logic.

`wf.adapters()` returns the resolved adapter bundle (registry defaults + constructs merged). It is a `MaybePromise`.
`wf.declaredAdapters()` returns the plugin-only adapter bundle (override-aware).

::: tabs
== TypeScript

```ts
type AdapterBundle = {
  cache?: Cache;
  constructs?: Record<string, unknown>;
  documents?: Document[];
  embedder?: Embedder;
  eventStream?: EventStream;
  image?: ImageModel;
  indexing?: Indexing;
  interrupt?: InterruptStrategy;
  checkpoint?: CheckpointStore;
  textSplitter?: TextSplitter;
  retriever?: Retriever;
  reranker?: Reranker;
  loader?: DocumentLoader;
  transformer?: DocumentTransformer;
  memory?: Memory;
  messages?: Message[];
  model?: Model;
  outputParser?: OutputParser;
  prompts?: PromptTemplate[];
  queryEngine?: QueryEngine;
  responseSynthesizer?: ResponseSynthesizer;
  speech?: SpeechModel;
  storage?: Storage;
  transcription?: TranscriptionModel;
  tools?: Tool[];
  trace?: AdapterTraceSink;
  kv?: KVStore;
  vectorStore?: VectorStore;
  schemas?: Schema[];
};
```

== JavaScript

```js
const adapterBundle = {
  cache: undefined,
  constructs: {},
  documents: [],
  embedder: undefined,
  eventStream: undefined,
  image: undefined,
  indexing: undefined,
  interrupt: undefined,
  checkpoint: undefined,
  textSplitter: undefined,
  retriever: undefined,
  reranker: undefined,
  loader: undefined,
  transformer: undefined,
  memory: undefined,
  messages: [],
  model: undefined,
  outputParser: undefined,
  prompts: [],
  queryEngine: undefined,
  responseSynthesizer: undefined,
  speech: undefined,
  storage: undefined,
  transcription: undefined,
  tools: [],
  trace: undefined,
  kv: undefined,
  vectorStore: undefined,
  schemas: [],
};
```

:::

Capabilities treat list-like adapters as presence flags (e.g., `tools: true` if any tools exist).
`model` is a concrete adapter instance rather than a boolean flag.
Custom constructs are stored under `constructs` to avoid widening core types.
Per-run registry resolution merges registry constructs into `adapters.constructs` before pipeline execution.
`constructs` expects a record map; non-object values are wrapped as `{ value }` for convenience.

## Effect return semantics

Effectful adapter operations return `MaybePromise<boolean | null>`:

- `true`: the operation succeeded.
- `false`: the operation failed (validation errors, missing inputs, or upstream failure).
- `null`: not applicable (capability not supported or intentionally skipped).

Examples:

- Cache/storage writes and deletes: `set`, `delete`, `put`, `mset`, `mdelete`.
- Memory writes: `append`, `reset`, `save`.
- Orchestration: checkpoint `set/delete/touch/sweep`, event streams `emit/emitMany`, trace sinks `emit/emitMany`.
- Vector store deletes: `delete` returns `true/false/null` (upsert returns data or `null`).

## Output parser (LangChain only)

Output parsers are LangChain-specific and are exposed as an adapter so you can reuse them with other
ecosystems when you already have an adapter model. Use them to parse structured outputs or apply
formatting logic downstream.

::: tabs
== TypeScript

```ts
import { fromLangChainOutputParser } from "#adapters";
import { StringOutputParser } from "@langchain/core/output_parsers";

const parser = fromLangChainOutputParser(new StringOutputParser());
const value = await parser.parse("hello");
```

== JavaScript

```js
import { fromLangChainOutputParser } from "#adapters";
import { StringOutputParser } from "@langchain/core/output_parsers";

const parser = fromLangChainOutputParser(new StringOutputParser());
const value = await parser.parse("hello");
```

:::

## Cache adapters (resume persistence)

`cache` is the adapter used to persist pause sessions for `resume()`. TTL is best‑effort and depends on
the underlying cache implementation.

### Helpers

::: tabs
== TypeScript

```ts
import {
  createMemoryCache,
  createCacheFromKVStore,
  fromLangChainStoreCache,
  fromLlamaIndexKVStoreCache,
} from "#adapters";

// 1. Simple in-memory (with TTL support)
const mem = createMemoryCache();

// 2. Wrap a generic KV store (e.g. Redis wrapper)
const redis = createCacheFromKVStore(myRedisKv);

// 3. Reuse ecosystem stores
const lc = fromLangChainStoreCache(langChainStore);
const li = fromLlamaIndexKVStoreCache(llamaIndexKv);
```

== JavaScript

```js
import {
  createMemoryCache,
  createCacheFromKVStore,
  fromLangChainStoreCache,
  fromLlamaIndexKVStoreCache,
} from "#adapters";

// 1. Simple in-memory (with TTL support)
const mem = createMemoryCache();

// 2. Wrap a generic KV store (e.g. Redis wrapper)
const redis = createCacheFromKVStore(myRedisKv);

// 3. Reuse ecosystem stores
const lc = fromLangChainStoreCache(langChainStore);
const li = fromLlamaIndexKVStoreCache(llamaIndexKv);
```

:::

## Adapter requirements (dependencies)

Adapters can fail early when required capabilities are missing instead of breaking at runtime.
They declare hard dependencies via metadata:

::: tabs
== TypeScript

```ts
metadata: {
  requires: [
    { kind: "construct", name: "retriever" },
    { kind: "capability", name: "tools" },
  ],
}
```

== JavaScript

```js
metadata: {
  requires: [
    { kind: "construct", name: "retriever" },
    { kind: "capability", name: "tools" },
  ],
}
```

:::

Registry resolution emits diagnostics when these are missing. Default mode warns; strict mode fails.
These diagnostics are produced when the registry resolves providers, not at call time.

## Vector store write path

Vector stores let you ingest and delete embeddings in a portable way (no raw SDKs).
Use this adapter when building ingestion pipelines or managing indexes.

::: tabs
== TypeScript

```ts
const store: VectorStore = {
  upsert: ({ documents }) => ({ ids: documents.map((doc) => doc.id ?? "new") }),
  delete: ({ ids }) => console.log(ids),
};
```

== JavaScript

```js
const store = {
  upsert: ({ documents }) => ({ ids: documents.map((doc) => doc.id ?? "new") }),
  delete: ({ ids }) => console.log(ids),
};
```

:::

## Media models (image, speech, transcription)

Image/speech/transcription models are first-class adapters. Only AI SDK provides these today,
so other ecosystems will show “unsupported” in interop docs.

::: tabs
== TypeScript

```ts
import { fromAiSdkImageModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const image = fromAiSdkImageModel(openai.image("gpt-image-1"));
```

== JavaScript

```js
import { fromAiSdkImageModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const image = fromAiSdkImageModel(openai.image("gpt-image-1"));
```

:::

## Runtime input diagnostics

Instead of throwing, adapters report actionable diagnostics that flow into the workflow trace.
Adapters can emit diagnostics when invoked with missing inputs using an optional call context:

::: tabs
== TypeScript

```ts
type AdapterCallContext = {
  report?: (diagnostic: AdapterDiagnostic) => void;
};
```

== JavaScript

```js
const context = {
  report: (diagnostic) => {
    // collect or forward diagnostics
  },
};
```

:::

Example (retriever):

::: tabs
== TypeScript

```ts
const diagnostics: AdapterDiagnostic[] = [];
const context = { report: (entry: AdapterDiagnostic) => diagnostics.push(entry) };
const result = await adapter.retrieve("", context);
// diagnostics includes "retriever_query_missing"
```

== JavaScript

```js
const diagnostics = [];
const context = { report: (entry) => diagnostics.push(entry) };
const result = await adapter.retrieve("", context);
// diagnostics includes "retriever_query_missing"
```

:::

Model calls report input issues via `ModelResult.diagnostics` (e.g. `model_input_missing`).
Workflow runtimes wrap adapters with `AdapterCallContext`, so these diagnostics appear automatically during runs.

## Adapter registration helpers (DX path)

The simplest way to register adapters is via value-first helpers. These return a Workflow-compatible plugin.

::: tabs
== TypeScript

```ts
import { Adapter } from "#adapters";

const retrieverPlugin = Adapter.retriever("custom.retriever", {
  retrieve: () => ({ documents: [] }),
});

const toolPlugin = Adapter.tools("custom.tools", [{ name: "search" }]);
```

== JavaScript

```js
import { Adapter } from "#adapters";

const retrieverPlugin = Adapter.retriever("custom.retriever", {
  retrieve: () => ({ documents: [] }),
});

const toolPlugin = Adapter.tools("custom.tools", [{ name: "search" }]);
```

:::

For custom constructs (e.g. `mcp`), use `Adapter.register`:

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

## Adapter registry (pipeline wrapper)

The registry is the mix-and-match engine. It wraps `makePipeline` and resolves construct providers
by id or default priority, emitting diagnostics for conflicts or missing providers. This is how
llm-core avoids silent adapter conflicts and hidden overrides.

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

const { adapters, diagnostics } = registry.resolve({
  constructs: [{ name: "model", required: true }],
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

const { adapters, diagnostics } = registry.resolve({
  constructs: [{ name: "model", required: true }],
});
```

:::

## Model execution (Model)

::: tabs
== TypeScript

```ts
type Model = {
  generate(call: ModelCall): MaybePromise<ModelResult>;
  stream?(call: ModelCall): MaybePromise<AsyncIterable<ModelStreamEvent>>;
};
```

== JavaScript

```js
const model = {
  generate: (call) => {
    // return { text, output?, usage?, meta?, diagnostics?, trace? }
  },
  stream: (call) => {
    // return async iterable of ModelStreamEvent
  },
};
```

:::

`Model.stream` is normalized across AI SDK, LangChain, and LlamaIndex. It emits
`ModelStreamEvent` records with a single `start` and `end`, plus `delta`, `usage`,
and `error` events in between. Provider-specific stream payloads are preserved in
`event.raw` when available.

### Ecosystem factory usage

::: tabs
== TypeScript

```ts
import { fromAiSdkModel } from "#adapters";
import { recipes } from "#recipes";
import { openai } from "@ai-sdk/openai";

const model = fromAiSdkModel(openai("gpt-4o-mini"));
const wf = recipes.agent().defaults({ adapters: { model } }).build();
```

== JavaScript

```js
import { fromAiSdkModel } from "#adapters";
import { recipes } from "#recipes";
import { openai } from "@ai-sdk/openai";

const model = fromAiSdkModel(openai("gpt-4o-mini"));
const wf = recipes.agent().defaults({ adapters: { model } }).build();
```

:::

`ModelCall` accepts `messages` and/or `prompt`. If both are set, `messages` win and a diagnostic is emitted:

::: tabs
== TypeScript

```ts
type ModelCall = {
  messages?: Message[];
  prompt?: string;
  responseSchema?: Schema;
  tools?: Tool[];
  toolChoice?: string;
  ...
};
```

== JavaScript

```js
const call = {
  messages: [{ role: "user", content: "hello" }],
  prompt: "hello",
  responseSchema: { jsonSchema: { type: "object", properties: {} } },
  tools: [{ name: "search" }],
  toolChoice: "auto",
};
```

:::

### Structured output behavior

- If `responseSchema` is provided, structured output is returned in `result.output`.
- `result.text` always returns a readable string representation (JSON string for structured results).
- When `responseSchema` is present, tools and toolChoice are ignored (diagnostics explain why).

### Validation helper

`validateModelCall(call)` returns diagnostics and schema normalization without executing the model:

::: tabs
== TypeScript

```ts
import { validateModelCall } from "#adapters";

const { diagnostics, allowTools, normalizedSchema } = validateModelCall(call);
```

== JavaScript

```js
import { validateModelCall } from "#adapters";

const { diagnostics, allowTools, normalizedSchema } = validateModelCall(call);
```

:::

### Model helpers

::: tabs
== TypeScript

```ts
import { ModelCallHelper, ModelHelper } from "#adapters";

const prepared = ModelCallHelper.prepare(call);
const adapter = ModelHelper.create(async (input) => {
  // implement Model.generate
  return { text: "ok" };
});
```

== JavaScript

```js
import { ModelCallHelper, ModelHelper } from "#adapters";

const prepared = ModelCallHelper.prepare(call);
const adapter = ModelHelper.create(async (input) => {
  // implement Model.generate
  return { text: "ok" };
});
```

:::

`ModelCallHelper.prepare` resolves prompt vs messages (messages win, even if empty) and bundles validation diagnostics.

## Output Parsers (Standalone)

Most users don't need this because `Model` handles structured output natively.
However, if you are migrating existing LangChain parsers, we support them as a distinct primitive.

::: tabs
== TypeScript

```ts
type OutputParser = {
  parse: (text: string, context?: AdapterCallContext) => MaybePromise<unknown>;
  formatInstructions?: (options?: Record<string, unknown>) => MaybePromise<string>;
};
```

== JavaScript

```js
const parser = {
  parse: (text) => JSON.parse(text),
  formatInstructions: () => "Return JSON",
};
```

:::

## Structured Query (IR for RAG)

Structured Query works like an Output Parser but for Retrieval.
It normalizes filter expressions (comparisons, AND/OR logic) into a portable IR so retrievers can execute them regardless of the backend (e.g., Pinecone vs generic filter).

::: tabs
== TypeScript

```ts
type StructuredQuery = {
  query: string;
  filter?: StructuredQueryFilter;
};

type StructuredQueryFilter = StructuredQueryComparison | StructuredQueryOperation;

type StructuredQueryComparison = {
  type: "comparison";
  comparator: "eq" | "gt" | "lt" | "gte" | "lte" | "ne" | "in" | "nin";
  attribute: string;
  value: string | number | boolean;
};

type StructuredQueryOperation = {
  type: "operation";
  operator: "and" | "or" | "not";
  args?: StructuredQueryFilter[];
};
```

== JavaScript

```js
const query = {
  query: "cats",
  filter: {
    type: "comparison",
    comparator: "eq",
    attribute: "species",
    value: "feline",
  },
};
```

:::

## Tools

::: tabs
== TypeScript

```ts
type Tool = {
  name: string;
  description?: string;
  params?: Array<{ name: string; type: string; required?: boolean }>;
  inputSchema?: Schema;
  outputSchema?: Schema;
  execute?: (input: unknown) => MaybePromise<unknown>;
};
```

:::

## Messages (structured content)

::: tabs
== TypeScript

```ts
type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | StructuredContent;
  name?: string;
  toolCallId?: string;
};
```

:::

## One-screen wiring examples

See the capability pages: [Models](./adapters/models.md), [Retrieval](./adapters/retrieval.md), and [Tools](./adapters/tools.md).
