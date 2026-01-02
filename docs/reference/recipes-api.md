# Recipes API (Recipe Handles)

Recipes are the front door to llm-core. Everything is a recipe handle: some recipes are leaf steps,
some are composite, but the public surface is the same.

> [!IMPORTANT] > **Recipes are the public story.** Packs/flows are internal composition tools; most users never need them.

Related:

- [Adapters API](/reference/adapters-api)
- [Composition Model](/reference/composition-model)

## Recipe handles (the public surface)

Every recipe exposes the same handle methods:

- `configure(config)` — recipe-specific behavior (prompts, retrieval knobs, tool options).
- `defaults(defaults)` — wiring and infra (adapters, plugins, retry defaults).
- `use(otherRecipe)` — composition (pluggable sub-recipes).
- `plan()` — returns the step graph (no side effects).
- `build()` — returns a reusable runnable.
- `run(input, runtime?)` — one-shot execution.

Use `defaults({ retryDefaults })` when you want per-recipe retry policy defaults; per-run overrides
live in `runtime.retry`.

::: tabs
== TypeScript

```ts
import { recipes } from "#recipes";
import type { AgentRecipeConfig } from "#recipes";

// Configure once, reuse across requests.
const agent = recipes["agent"]()
  .configure({
    planning: { modelInstructions: "Plan before acting." },
    tools: { toolChoice: "auto" },
  } satisfies AgentRecipeConfig)
  .defaults({ adapters: { model, tools, memory } }); // Wire adapters once.

const result = await agent.run({ input: "Help me debug this RAG flow." });
```

== JavaScript

```js
import { recipes } from "#recipes";

// Configure once, reuse across requests.
const agent = recipes["agent"]()
  .configure({
    planning: { modelInstructions: "Plan before acting." },
    tools: { toolChoice: "auto" },
  })
  .defaults({ adapters: { model, tools, memory } }); // Wire adapters once.

const result = await agent.run({ input: "Help me debug this RAG flow." });
```

:::

## Recipe-specific config (no global junk drawer)

Each recipe exports its own config type. `configure()` only accepts that type.
There is no global `RecipeConfig` bag.

::: tabs
== TypeScript

```ts
import type { RagRecipeConfig } from "#recipes";

const rag = recipes["rag"]().configure({
  retrieval: { topK: 8 },
  synthesis: { system: "Cite your sources." },
} satisfies RagRecipeConfig);
```

== JavaScript

```js
const rag = recipes["rag"]().configure({
  retrieval: { topK: 8 },
  synthesis: { system: "Cite your sources." },
});
```

:::

## plan(): see the graph

`plan()` gives you a stable, inspectable view of the recipe DAG.

::: tabs
== TypeScript

```ts
type PlanView = { steps: Array<{ id: string }> };

const plan: PlanView = recipes["rag"]().plan();
// Inspect the resolved step graph.
console.log(plan.steps.map((step) => step.id));
```

== JavaScript

```js
const plan = recipes["rag"]().plan();
// Inspect the resolved step graph.
console.log(plan.steps.map((step) => step.id));
```

:::

## build(): reusable runnables

`build()` is optional, but useful when you want to cache a configured recipe.

::: tabs
== TypeScript

```ts
const runnable = recipes["rag"]()
  .configure({ retrieval: { topK: 5 } })
  .defaults({ adapters: { model, retriever } }) // Keep wiring separate.
  .build();

type RagRunnable = typeof runnable;
const outcome = await(runnable as RagRunnable)({ input: "Explain DSP." });
```

== JavaScript

```js
const runnable = recipes["rag"]()
  .configure({ retrieval: { topK: 5 } })
  .defaults({ adapters: { model, retriever } }) // Keep wiring separate.
  .build();

const outcome = await runnable({ input: "Explain DSP." });
```

:::
