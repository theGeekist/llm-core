# The Engine (Workflow API)

The **Workflow** is the execution engine for `llm-core`.
You author your logic in **Recipes**, compile them into a Workflow, and then `.run()` them.

This API is for **Execution** and **Advanced Control**.
Most of the time, you will interact with `recipes.*()` instead.

Related:

- [Packs & Recipes](/reference/packs-and-recipes) (Authoring API)
- [Runtime API](/reference/runtime) (Context object details)

## Quick Start (Execution)

Once you have a recipe handle, you compile and run it.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core/recipes";
import type { AgentRecipeConfig } from "@geekist/llm-core/recipes";

// 1. Author
const agent = recipes.agent().configure({} satisfies AgentRecipeConfig);

// 2. Compile (Build)
const workflow = agent.build();

// 3. Execute (Run)
const result = await workflow.run({ input: "Do work" });

if (result.status === "ok") {
  console.log(result.artefact);
}
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core/recipes";

// 1. Author
const agent = recipes.agent();

// 2. Compile (Build)
const workflow = agent.build();

// 3. Execute (Run)
const result = await workflow.run({ input: "Do work" });

if (result.status === "ok") {
  console.log(result.artefact);
}
```

:::

## Adapter helpers (DX path)

Register adapters without touching registry types. The workflow surface stays clean but the adapter surface stays explicit.

::: tabs
== TypeScript

```ts
import { recipes } from "#recipes";
import type { Retriever } from "#adapters";

const retriever: Retriever = {
  retrieve: () => ({ documents: [] }),
};

const wf = recipes.rag().defaults({ adapters: { retriever } }).build();
```

== JavaScript

```js
import { recipes } from "#recipes";

const retriever = {
  retrieve: () => ({ documents: [] }),
};

const wf = recipes.rag().defaults({ adapters: { retriever } }).build();
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
const agent = recipes.agent(); // typed recipe handle
const wf = agent.build(); // typed input + artefacts
```

== JavaScript

```js
const agent = recipes.agent();
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
type SyncOutcome = typeof out;
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
import type { Runtime } from "#workflow";

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
} satisfies Runtime;

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
import type { Runtime } from "#workflow";

const overrides = {
  providers: { model: "ai-sdk:openai:gpt-4o-mini", retriever: "llamaindex:vector" },
} satisfies Runtime;

const out = await wf.run({ input: "..." }, overrides);
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
