# Adapter API (Contracts + Helpers)

Adapters are how llm-core keeps the ecosystem from leaking into your app.
Most users never need this page because recipes and workflows already ship with adapters wired in.
You only come here when you want to integrate a new provider, bridge an external SDK, or take full control.

Adapters exist to contain ecosystem differences, not expose them. They normalize wildly different concepts
(models, tools, retrievers, messages, schemas) into a stable internal shape while keeping provider details
available for diagnostics and tracing.

Related:

- [Workflow API](/reference/workflow-api)
- [Packs & Recipes](/reference/packs-and-recipes)
- [Runtime channel](/reference/runtime)

## Adapter bundle (resolved on a workflow)

This is primarily useful for validation, debugging, and tooling but not day‑to‑day workflow logic.

`wf.adapters()` returns the resolved adapter bundle (registry defaults + constructs merged). It is a `MaybePromise`.
`wf.declaredAdapters()` returns the plugin-only adapter bundle (override-aware).

::: tabs
== TypeScript

```ts
type AdapterBundle = {
  model?: Model;
  tools?: Tool[];
  messages?: Message[];
  documents?: Document[];
  trace?: AdapterTraceSink;
  prompts?: PromptTemplate[];
  schemas?: Schema[];
  cache?: Cache;
  image?: ImageModel;
  textSplitter?: TextSplitter;
  embedder?: Embedder;
  retriever?: Retriever;
  reranker?: Reranker;
  loader?: DocumentLoader;
  transformer?: DocumentTransformer;
  memory?: Memory;
  speech?: SpeechModel;
  storage?: Storage;
  transcription?: TranscriptionModel;
  kv?: KVStore;
  vectorStore?: VectorStore;
  constructs?: Record<string, unknown>;
};
```

== JavaScript

```js
const adapterBundle = {
  model: undefined,
  tools: [],
  messages: [],
  documents: [],
  trace: undefined,
  prompts: [],
  schemas: [],
  cache: undefined,
  image: undefined,
  textSplitter: undefined,
  embedder: undefined,
  retriever: undefined,
  reranker: undefined,
  loader: undefined,
  transformer: undefined,
  memory: undefined,
  speech: undefined,
  storage: undefined,
  transcription: undefined,
  kv: undefined,
  vectorStore: undefined,
  constructs: {},
};
```

:::

Capabilities treat list-like adapters as presence flags (e.g., `tools: true` if any tools exist).
`model` is a concrete adapter instance rather than a boolean flag.
Custom constructs are stored under `constructs` to avoid widening core types.
Per-run registry resolution merges registry constructs into `adapters.constructs` before pipeline execution.
`constructs` expects a record map; non-object values are wrapped as `{ value }` for convenience.

## Cache adapters (resume persistence)

`cache` is the adapter used to persist pause sessions for `resume()`. TTL is best‑effort and depends on
the underlying cache implementation.

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
};
```

== JavaScript

```js
const model = {
  generate: (call) => {
    // return { text, output?, usage?, meta?, diagnostics?, trace? }
  },
};
```

:::

### Ecosystem factory usage

::: tabs
== TypeScript

```ts
import { fromAiSdkModel, Adapter } from "#adapters";
import { Workflow } from "#workflow";
import { openai } from "@ai-sdk/openai";

const wf = Workflow.recipe("agent")
  .use(Adapter.model("openai.model", fromAiSdkModel(openai("gpt-4o-mini"))))
  .build();
```

== JavaScript

```js
import { fromAiSdkModel, Adapter } from "#adapters";
import { Workflow } from "#workflow";
import { openai } from "@ai-sdk/openai";

const wf = Workflow.recipe("agent")
  .use(Adapter.model("openai.model", fromAiSdkModel(openai("gpt-4o-mini"))))
  .build();
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

### Structured output contract

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

== JavaScript

```js
const tool = {
  name: "search",
  description: "Search the web",
  params: [{ name: "query", type: "string", required: true }],
  inputSchema: { jsonSchema: { type: "object", properties: {} } },
  outputSchema: { jsonSchema: { type: "object", properties: {} } },
  execute: (input) => ({ ok: true, input }),
};
```

:::

Param schemas normalize to object‑typed JSON schema when needed. Parameter types expect JSON Schema
primitives; unknown types fall back to `"string"`.

AI SDK tool adapters accept either AI SDK schema wrappers or raw JSON schema objects; both normalize
through `toSchema`.

### Tool helpers

::: tabs
== TypeScript

```ts
import { Tooling } from "#adapters";

const params = [Tooling.param("query", "string", { required: true })];
const tool = Tooling.create({ name: "search", params });
```

== JavaScript

```js
import { Tooling } from "#adapters";

const params = [Tooling.param("query", "string", { required: true })];
const tool = Tooling.create({ name: "search", params });
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

== JavaScript

```js
const message = {
  role: "user",
  content: "Find me a doc about capybaras.",
  name: "user-1",
};
```

:::

Structured content carries text plus parts (text, images, files, tool calls, tool results).
Binary image/file parts are preserved and base64‑encoded in adapters.

## Schemas

`Schema` accepts JSON schema or Zod.

::: tabs
== TypeScript

```ts
type Schema = {
  name?: string;
  jsonSchema: unknown;
  kind?: "json-schema" | "zod" | "unknown";
};
```

== JavaScript

```js
const schema = {
  name: "AnswerSchema",
  jsonSchema: { type: "object", properties: { answer: { type: "string" } } },
};
```

:::

Normalization guarantees object schemas include `properties`.

## Prompt schemas

Prompt templates can expose input schemas. LangChain and LlamaIndex only provide variable names,
so adapters default types to `string`. AI SDK does not expose prompt templates.

::: tabs
== TypeScript

```ts
import { toPromptInputSchema, validatePromptInputs } from "#adapters";

const inputSchema = toPromptInputSchema(prompt.schema!);
const diagnostics = validatePromptInputs(prompt.schema!, { name: "Ada" });
```

== JavaScript

```js
import { toPromptInputSchema, validatePromptInputs } from "#adapters";

const inputSchema = toPromptInputSchema(prompt.schema);
const diagnostics = validatePromptInputs(prompt.schema, { name: "Ada" });
```

:::

## Telemetry + trace

Adapters expose provider metadata in `result.telemetry`.
Trace events are derived from telemetry where possible:

::: tabs
== TypeScript

```ts
type ModelTelemetry = {
  request?: { body?: unknown };
  response?: { id?: string; modelId?: string; timestamp?: number; body?: unknown };
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  totalUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  warnings?: AdapterDiagnostic[];
  providerMetadata?: Record<string, unknown>;
};
```

== JavaScript

```js
const telemetry = {
  request: { body: {} },
  response: { id: "req-1", modelId: "gpt-4o-mini", timestamp: Date.now() },
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  warnings: [],
  providerMetadata: {},
};
```

:::

Diagnostics may include `usage_unavailable` when a provider does not report token usage.

## Adapter validation helpers

::: tabs
== TypeScript

```ts
import { hasAdapter, validateAdapters } from "#workflow/adapter-validation";

const adapters = await runtime.adapters();
hasAdapter(adapters, "tools"); // true if non-empty tools
validateAdapters(adapters, ["model", "retriever"]);
```

== JavaScript

```js
import { hasAdapter, validateAdapters } from "#workflow/adapter-validation";

const adapters = await runtime.adapters();
hasAdapter(adapters, "tools");
validateAdapters(adapters, ["model", "retriever"]);
```

:::

## MaybePromise semantics

All adapter methods may return sync or async values. Call sites should treat them as `MaybePromise`.

## One-screen wiring examples

### AI SDK model + custom retriever

::: tabs
== TypeScript

```ts
import { fromAiSdkModel, Adapter } from "#adapters";
import { Workflow } from "#workflow";
import { openai } from "@ai-sdk/openai";

const retriever = {
  retrieve: () => ({ documents: [{ text: "capybara facts" }] }),
};

const wf = Workflow.recipe("rag")
  .use(Adapter.model("openai.model", fromAiSdkModel(openai("gpt-4o-mini"))))
  .use(Adapter.retriever("custom.retriever", retriever))
  .build();

const out = await wf.run({ input: "What is a capybara?" });
```

== JavaScript

```js
import { fromAiSdkModel, Adapter } from "#adapters";
import { Workflow } from "#workflow";
import { openai } from "@ai-sdk/openai";

const retriever = {
  retrieve: () => ({ documents: [{ text: "capybara facts" }] }),
};

const wf = Workflow.recipe("rag")
  .use(Adapter.model("openai.model", fromAiSdkModel(openai("gpt-4o-mini"))))
  .use(Adapter.retriever("custom.retriever", retriever))
  .build();

const out = await wf.run({ input: "What is a capybara?" });
```

:::
