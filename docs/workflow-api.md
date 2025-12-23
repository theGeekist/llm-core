# Workflow API

The Workflow API is small on purpose. You describe _what_ you’re building (a recipe), layer in behavior, and run it. Every decision is inspectable. If you’ve used a pipeline or builder before, this will feel familiar.
All runs return a structured outcome with trace + diagnostics. Sync or async — it’s always `MaybePromise`.

Related:

- [Adapter contracts + helpers](/adapters-api)
- [Runtime channel details](/runtime)

## Quick Start

If this is your first pass, don’t overthink it: you only touch a few methods to get a reliable run.

::: tabs
== TypeScript

```ts
import { Workflow } from "@geekist/llm-core/workflow";
import { Outcome } from "@geekist/llm-core";

const wf = Workflow.recipe("rag")
  .use({ key: "model.openai", capabilities: { model: { name: "gpt-4.1" } } })
  .use({ key: "retriever.vector", capabilities: { retriever: { type: "vector" } } })
  .build();

const out = await wf.run({ input: "What is a capybara?" });

Outcome.match(out, {
  ok: ({ artefact }) => artefact["answer.text"],
  paused: ({ token }) => `Paused: ${String(token)}`,
  error: ({ error }) => `Failed: ${String(error)}`,
});
```

== JavaScript

```js
import { Workflow } from "@geekist/llm-core/workflow";
import { Outcome } from "@geekist/llm-core";

const wf = Workflow.recipe("rag")
  .use({ key: "model.openai", capabilities: { model: { name: "gpt-4.1" } } })
  .use({ key: "retriever.vector", capabilities: { retriever: { type: "vector" } } })
  .build();

const out = await wf.run({ input: "What is a capybara?" });

Outcome.match(out, {
  ok: ({ artefact }) => artefact["answer.text"],
  paused: ({ token }) => `Paused: ${String(token)}`,
  error: ({ error }) => `Failed: ${String(error)}`,
});
```

:::

Recipes ship with minimal default plugins. `.use(...)` extends or overrides those defaults.

## Adapter helpers (DX path)

Register adapters without touching registry types. The workflow surface stays clean but the adapter surface stays explicit.

::: tabs
== TypeScript

```ts
import { Adapter } from "#adapters";
import { Workflow } from "#workflow";

const wf = Workflow.recipe("rag")
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
import { Workflow } from "#workflow";

const wf = Workflow.recipe("rag")
  .use(
    Adapter.retriever("custom.retriever", {
      retrieve: () => ({ documents: [] }),
    }),
  )
  .build();
```

:::

## Surface Area

This list looks longer than it feels in practice. Most apps need maybe only 3-4 methods.

- `Workflow.recipe(name)` -> builder
- `.use(plugin)` -> compose
- `.build()` -> runnable workflow
- `.run(input, runtime?)` -> outcome union (ok | paused | error)
- `.resume(token, resumeInput?, runtime?)` -> only if a recipe exposes it
- `wf.capabilities()` -> resolved capabilities (override-aware; list-like adapters surface as presence flags; `model` is the adapter instance; MaybePromise)
- `wf.declaredCapabilities()` -> plugin-only capabilities (override-aware)
- `wf.adapters()` -> resolved adapter bundle (registry defaults + constructs merged; MaybePromise)
- `wf.declaredAdapters()` -> plugin-only adapter bundle (override-aware)
- `wf.explain()` -> composition snapshot (declared + resolved capabilities, overrides, unused, missing requirements)
- `wf.contract()` -> declared recipe contract

## Recipe Name Drives Inference

If you give us a literal recipe name, we give you full type safety.

::: tabs
== TypeScript

```ts
const wf = Workflow.recipe("agent"); // typed input + artefacts
```

== JavaScript

```js
const wf = Workflow.recipe("agent");
```

:::

Dynamic names are allowed, it just means you trade types for runtime diagnostics.

## Outcomes Are Always Present

You never get `undefined` because every run returns a shape you must handle, and it always includes `trace` + `diagnostics`:

::: tabs
== TypeScript

```ts
type Outcome<TArtefact> =
  | { status: "ok"; artefact: TArtefact; trace: TraceEvent[]; diagnostics: unknown[] }
  | {
      status: "paused";
      token: unknown;
      artefact: Partial<TArtefact>;
      trace: TraceEvent[];
      diagnostics: unknown[];
    }
  | { status: "error"; error: unknown; trace: TraceEvent[]; diagnostics: unknown[] };
```

== JavaScript

```js
const out = {
  status: "ok",
  artefact: { answer: "..." },
  trace: [],
  diagnostics: [],
};
```

:::

### Helpers

::: tabs
== TypeScript

```ts
Outcome.ok(out); // type guard
Outcome.match(out, handlers); // exhaustive handling
Outcome.mapOk(out, fn); // transforms ok artefact only
```

== JavaScript

```js
Outcome.ok(out);
Outcome.match(out, handlers);
Outcome.mapOk(out, (artefact) => artefact);
```

:::

## Sync and Async by Default

`run()` returns `MaybePromise`. If the pipeline is sync, you can stay sync:

::: tabs
== TypeScript

```ts
const out = wf.run({ input: "sync-call" });
if (out.status === "ok") {
  // no await required
}
```

== JavaScript

```js
const out = wf.run({ input: "sync-call" });
if (out.status === "ok") {
  // no await required
}
```

:::

## Runtime Channel (Operational Concerns)

Runtime carries operational concerns so plugins stay pure.

::: tabs
== TypeScript

```ts
const runtime = {
  reporter: { warn: (msg, ctx) => console.warn(msg, ctx) },
  diagnostics: "default",
  budget: { maxTokens: 2000 },
  persistence: {
    /* adapter */
  },
  traceSink: {
    /* sink */
  },
  resume: {
    /* adapter */
  },
};

await wf.run({ input: "..." }, runtime);
```

== JavaScript

```js
const runtime = {
  reporter: { warn: (msg, ctx) => console.warn(msg, ctx) },
  diagnostics: "default",
  budget: { maxTokens: 2000 },
  persistence: {
    /* adapter */
  },
  traceSink: {
    /* sink */
  },
  resume: {
    /* adapter */
  },
};

await wf.run({ input: "..." }, runtime);
```

:::

## Mix-and-match providers

Workflows resolve construct providers via the adapter registry (a thin wrapper around `makePipeline`).
You can override providers per run without widening the core API:

::: tabs
== TypeScript

```ts
const out = await wf.run(
  { input: "..." },
  { providers: { model: "ai-sdk:openai:gpt-4o-mini", retriever: "llamaindex:vector" } },
);
```

== JavaScript

```js
const out = await wf.run(
  { input: "..." },
  { providers: { model: "ai-sdk:openai:gpt-4o-mini", retriever: "llamaindex:vector" } },
);
```

:::

## Explain and Contract

`explain()` is the source of truth for “why is it shaped like this?”

::: tabs
== TypeScript

```ts
wf.explain();
// {
//   plugins: [...],
//   capabilities: {...},         // resolved, override-aware
//   declaredCapabilities: {...}, // raw declared
//   overrides: [...],
//   unused: [...],
//   missingRequirements: [...]
// }
```

== JavaScript

```js
wf.explain();
// {
//   plugins: [...],
//   capabilities: {...},
//   declaredCapabilities: {...},
//   overrides: [...],
//   unused: [...],
//   missingRequirements: [...]
// }
```

:::

`contract()` always returns the declared recipe contract (stable, reviewable).

## Resume (HITL Recipes)

`resume()` only exists for recipes that explicitly support it. If present, it accepts a token and optional human input.
It uses `runtime.resume.resolve(...)` when provided; otherwise it returns an error outcome.
