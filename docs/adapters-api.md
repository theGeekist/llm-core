# Adapter API (Contracts + Helpers)

Adapters normalize external ecosystem constructs (models, tools, retrievers, messages, schemas) into one consistent shape.
The adapter surface is value-first and stays internal unless you opt into it.

Related:

- Workflow API: `docs/workflow-api.md`
- Recipes + plugins: `docs/recipes-and-plugins.md`
- Runtime channel: `docs/runtime.md`

## Adapter bundle (resolved on a workflow)

`wf.adapters()` returns the resolved adapter bundle (registry defaults + constructs merged). It is a `MaybePromise`.
`wf.declaredAdapters()` returns the plugin-only adapter bundle (override-aware).

```ts
type AdapterBundle = {
  model?: AdapterModel;
  tools?: AdapterTool[];
  messages?: AdapterMessage[];
  documents?: AdapterDocument[];
  trace?: AdapterTraceSink;
  prompts?: AdapterPromptTemplate[];
  schemas?: AdapterSchema[];
  textSplitter?: AdapterTextSplitter;
  embedder?: AdapterEmbedder;
  retriever?: AdapterRetriever;
  reranker?: AdapterReranker;
  loader?: AdapterDocumentLoader;
  transformer?: AdapterDocumentTransformer;
  memory?: AdapterMemory;
  storage?: AdapterStorage;
  kv?: AdapterKVStore;
  constructs?: Record<string, unknown>;
};
```

Capabilities treat list-like adapters as presence flags (e.g., `tools: true` if any tools exist).
`model` is a concrete adapter instance rather than a boolean flag.
Custom constructs are stored under `constructs` to avoid widening core types.
Per-run registry resolution merges registry constructs into `adapters.constructs` before pipeline execution.
`constructs` expects a record map; non-object values are wrapped as `{ value }` for convenience.

## Adapter registration helpers (DX path)

The simplest way to register adapters is via value-first helpers. These return a Workflow-compatible plugin.

```ts
import { Adapter } from "#adapters";

const retrieverPlugin = Adapter.retriever("custom.retriever", {
  retrieve: () => ({ documents: [] }),
});

const toolPlugin = Adapter.tools("custom.tools", [{ name: "search" }]);
```

For custom constructs (e.g. `mcp`), use `Adapter.register`:

```ts
const plugin = Adapter.register("custom.mcp", "mcp", { client });
```

## Adapter registry (pipeline wrapper)

The registry is the mix-and-match engine. It wraps `makePipeline` and resolves construct providers
by id or default priority, emitting diagnostics for conflicts or missing providers.

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

## Model execution (AdapterModel)

```ts
type AdapterModel = {
  generate(call: AdapterModelCall): AdapterMaybePromise<AdapterModelResult>;
};
```

### Ecosystem factory usage

```ts
import { fromAiSdkModel, Adapter } from "#adapters";
import { Workflow } from "#workflow";
import { openai } from "@ai-sdk/openai";

const wf = Workflow.recipe("agent")
  .use(Adapter.model("openai.model", fromAiSdkModel(openai("gpt-4o-mini"))))
  .build();
```

`AdapterModelCall` accepts `messages` and/or `prompt`. If both are set, `messages` win and a diagnostic is emitted:

```ts
type AdapterModelCall = {
  messages?: AdapterMessage[];
  prompt?: string;
  responseSchema?: AdapterSchema;
  tools?: AdapterTool[];
  toolChoice?: string;
  ...
};
```

### Structured output contract

- If `responseSchema` is provided, structured output is returned in `result.output`.
- `result.text` always returns a readable string representation (JSON string for structured results).
- When `responseSchema` is present, tools and toolChoice are ignored (diagnostics explain why).

### Validation helper

`validateModelCall(call)` returns diagnostics and schema normalization without executing the model:

```ts
import { validateModelCall } from "#adapters";

const { diagnostics, allowTools, normalizedSchema } = validateModelCall(call);
```

### Model helpers

```ts
import { Model, ModelCall } from "#adapters";

const prepared = ModelCall.prepare(call);
const adapter = Model.create(async (input) => {
  // implement AdapterModel.generate
  return { text: "ok" };
});
```

`ModelCall.prepare` resolves prompt vs messages (messages win, even if empty) and bundles validation diagnostics.

## Tools

```ts
type AdapterTool = {
  name: string;
  description?: string;
  params?: Array<{ name: string; type: string; required?: boolean }>;
  inputSchema?: AdapterSchema;
  outputSchema?: AdapterSchema;
  execute?: (input: unknown) => AdapterMaybePromise<unknown>;
};
```

Param schemas normalize to object‑typed JSON schema when needed. Parameter types expect JSON Schema
primitives; unknown types fall back to `"string"`.

### Tool helpers

```ts
import { Tool } from "#adapters";

const params = [Tool.param("query", "string", { required: true })];
const tool = Tool.create({ name: "search", params });
```

## Messages (structured content)

```ts
type AdapterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | AdapterStructuredContent;
  name?: string;
  toolCallId?: string;
};
```

Structured content carries text plus parts (text, images, files, tool calls, tool results).
Binary image/file parts are preserved and base64‑encoded in adapters.

## Schemas

`AdapterSchema` accepts JSON schema or Zod.

```ts
type AdapterSchema = {
  name?: string;
  jsonSchema: unknown;
  kind?: "json-schema" | "zod" | "unknown";
};
```

Normalization guarantees object schemas include `properties`.

## Prompt schemas

Prompt templates can expose input schemas. LangChain and LlamaIndex only provide variable names,
so adapters default types to `string`. AI SDK does not expose prompt templates.

```ts
import { toPromptInputSchema, validatePromptInputs } from "#adapters";

const inputSchema = toPromptInputSchema(prompt.schema!);
const diagnostics = validatePromptInputs(prompt.schema!, { name: "Ada" });
```

## Telemetry + trace

Adapters expose provider metadata in `result.telemetry`.
Trace events are derived from telemetry where possible:

```ts
type AdapterModelTelemetry = {
  request?: { body?: unknown };
  response?: { id?: string; modelId?: string; timestamp?: number; body?: unknown };
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  totalUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  warnings?: AdapterDiagnostic[];
  providerMetadata?: Record<string, unknown>;
};
```

Diagnostics may include `usage_unavailable` when a provider does not report token usage.

## Adapter validation helpers

```ts
import { hasAdapter, validateAdapters } from "#workflow/adapter-validation";

const adapters = await runtime.adapters();
hasAdapter(adapters, "tools"); // true if non-empty tools
validateAdapters(adapters, ["model", "retriever"]);
```

## MaybePromise semantics

All adapter methods may return sync or async values. Call sites should treat them as `MaybePromise`.

## One-screen wiring examples

### AI SDK model + custom retriever

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
