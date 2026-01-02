# Composition Model (Packs & Recipes)

This reference explains the final compositional shape of `llm-core`: **one unified Recipe surface** with explicit ordering, introspection, and configuration.

The goal is low complexity with full fidelity: no hidden ordering, no implicit wiring, and no pack-vs-flow confusion at the call site.

> [!TIP] > **Summary**: Use this model to understand how `recipes.agent()` actually works under the hood. It clarifies the relationship between **Recipes** (what you buy), **Packs** (how they are organized), and **Steps** (what actually runs).

```mermaid
graph TD
    User -->|Calls| R[Recipe Handle]
    R -->|Configures| P[Pack / Flow]
    P -->|Contains| S1[Step A]
    P -->|Contains| S2[Step B]
    R -->|Uses (.use)| R2[Sub-Recipe]
    R2 -->|Resolves to| S3[Step C]

    style R fill:#d4e6f1,stroke:#3498db
    style S1 fill:#f9e79f,stroke:#f1c40f
    style S2 fill:#f9e79f,stroke:#f1c40f
```

## Why this shape

- **One mental model**: everything a user touches is a Recipe.
- **Ordering is explicit**: step-level `dependsOn` + `priority` control scheduling.
- **Config vs wiring is clear**: `configure()` for behavior, `defaults()` for wiring, `run()` for per-run overrides.
- **Composable by default**: `.use()` is the standard way to plug recipes together.
- **Inspectable**: `.plan()` exposes the full step graph for visualization and debugging.

## The Unified Recipe Handle

Every recipe (leaf or composite) exposes the same surface:

- `configure(config)` - recipe-specific behavior (prompts, retrieval knobs, batch modes).
- `defaults({ adapters, plugins })` - wiring and infra defaults.
- `use(recipe)` - composition of other recipes.
- `plan()` - the full step plan and dependencies.
- `build()` - advanced, returns a reusable runnable.
- `run(input, overrides?)` - the primary entry point.

Each recipe exports `XRecipeConfig`, and `configure()` only accepts that type. There is no global config bag.

:::tabs
== TypeScript

```ts
import { recipes } from "#recipes";
import type { RagRecipeConfig } from "#recipes";

const rag = recipes
  .rag()
  .configure({
    prompt: { system: "You are a helpful assistant." },
    retrieval: { topK: 5 },
  } satisfies RagRecipeConfig)
  .defaults({
    adapters: { model, retriever, reranker },
  });

// Configure once, reuse across requests.
const out = await rag.run({ input: "Explain DSP", documents }, { adapters: { model: fastModel } });
```

== JavaScript

```js
import { recipes } from "#recipes";

const rag = recipes
  .rag()
  .configure({
    prompt: { system: "You are a helpful assistant." },
    retrieval: { topK: 5 },
  })
  .defaults({
    adapters: { model, retriever, reranker },
  });

// Configure once, reuse across requests.
const out = await rag.run({ input: "Explain DSP", documents }, { adapters: { model: fastModel } });
```

:::

Dot-separated recipe names are accessed via bracket notation when needed:

:::tabs
== TypeScript

```ts
import type { Retriever } from "#adapters";

const retriever: Retriever = { retrieve: () => ({ documents: [] }) };
const retrieval = recipes["rag.retrieval"]().defaults({ adapters: { retriever } });
```

== JavaScript

```js
const retriever = { retrieve: () => ({ documents: [] }) };
const retrieval = recipes["rag.retrieval"]().defaults({ adapters: { retriever } });
```

:::

## Config vs Defaults vs Run Overrides

**Configure** is behavioral. **Defaults** are wiring. **Run overrides** are per-run escape hatches.

- `configure()`:
  - prompts, retrieval knobs, batch mode, UI channel, pack-specific knobs
  - always recipe-specific types (no global config bag)
- `defaults()`:
  - adapters, plugins, retry defaults
  - stable for a given recipe instance
- `run(input, overrides)`:
  - per-run adapter swaps, providers, pack overrides, runtime controls

:::tabs
== TypeScript

```ts
import type { AgentRecipeConfig } from "#recipes";

const agent = recipes
  .agent()
  .configure({ agent: { role: "support" } } satisfies AgentRecipeConfig)
  .defaults({ adapters: { model, tools, memory } });

const out = await agent.run(
  { input: "Help me debug a RAG pipeline" },
  { adapters: { model: fastModel } },
);
```

== JavaScript

```js
const agent = recipes
  .agent()
  .configure({ agent: { role: "support" } })
  .defaults({ adapters: { model, tools, memory } });

const out = await agent.run(
  { input: "Help me debug a RAG pipeline" },
  { adapters: { model: fastModel } },
);
```

:::

## Composition: Recipes Use Recipes

> **Why this matters**: This is how you build complex agents from simple blocks.

Packs are an internal composition primitive. Publicly, everything is a Recipe handle.
Packs and flows are primarily for recipe authors and internal composition. Most users only touch `recipes.*`.

:::tabs
== TypeScript

```ts
import type { AgentRecipeConfig } from "#recipes";

const supportAgent = recipes
  .agent()
  .use(recipes.rag())
  .use(recipes.hitl())
  .configure({
    agent: { role: "support" },
    rag: { retrieval: { topK: 8 } },
  } satisfies AgentRecipeConfig)
  .defaults({ adapters: { model, tools, retriever, vectorStore } });

const out = await supportAgent.run({ input: "Investigate the outage" });
```

== JavaScript

```js
const supportAgent = recipes
  .agent()
  .use(recipes.rag())
  .use(recipes.hitl())
  .configure({
    agent: { role: "support" },
    rag: { retrieval: { topK: 8 } },
  })
  .defaults({ adapters: { model, tools, retriever, vectorStore } });

const out = await supportAgent.run({ input: "Investigate the outage" });
```

:::

## Step Ordering: dependsOn + priority + mode

> **Why this matters**: Controls exactly when code runs, preventing "race conditions" in your logic.

Execution is still step-level and DAG-driven. Ordering is never hidden.

- `dependsOn(...)` defines explicit graph edges (primary ordering).
- `priority(n)` is a tie-breaker when the DAG allows multiple orders.
- `override()` / `extend()` control how steps are merged when duplicates exist.

Ordering rules:

1. The pipeline resolves the DAG (Kahn + priority).
2. When still tied, steps are registered deterministically by key.

## Plan API (visibility without side effects)

`plan()` materializes the step graph. It is pure data and has no runtime effect.

```ts
type RecipeStepPlan = {
  id: string; // "rag-retrieval.retrieve"
  label?: string; // "Retrieve documents"
  recipe: string; // "rag", "agent", "hitl", ...
  kind?: "llm" | "tool" | "io" | "hitl" | "ui" | "custom";
  dependsOn: string[];
  priority?: number;
  mode?: "extend" | "override";
};

type RecipePlan = {
  name: string;
  steps: RecipeStepPlan[];
};
```

:::tabs
== TypeScript

```ts
type PlanView = { steps: Array<{ id: string }> };

const plan: PlanView = recipes.agent().use(recipes.rag()).use(recipes.hitl()).plan();

console.log(plan.steps);
```

== JavaScript

```js
const plan = recipes.agent().use(recipes.rag()).use(recipes.hitl()).plan();

console.log(plan.steps);
```

:::

Use cases:

- log or visualize the DAG
- diff plans in tests
- explain "what runs when" without reading code

## Step Metadata (optional but recommended)

Recipe steps can include metadata for clarity without affecting execution.

```ts
step("retrieve", applyRetrieve).dependsOn("seed").label("Retrieve documents").kind("io");
```

Metadata is used by `plan()` and downstream tooling but does not change behavior.

## Step Rollbacks (optional)

Recipes can register rollback handlers without touching pipeline internals.
Use `step(...).rollback(...)` for static rollbacks or `Recipe.rollback(...)` inside a step:

```ts
const rollbackStep = step("only", apply).rollback(() => true);

const applyWithRollback: StepApply = () => ({
  rollback: Recipe.rollback(() => true),
});
```

Rollback handlers are only executed when an interrupt strategy requests restart.

## State Validation (optional)

Flows can attach a lightweight state validator for diagnostics + trace annotation.

```ts
const validateState = (state: unknown) => ({ valid: !!state });

const wf = Recipe.flow("rag").state(validateState).use(pack).build();
```

When validation fails, the run stays `ok`/`paused` but emits a recipe diagnostic
and a `recipe.state.invalid` trace event.

## Event Conventions (optional)

Recipes can emit workflow events through the adapter event stream and store them
on `state.events` for inspection:

```ts
const applyEmit: StepApply = ({ context, state }) =>
  emitRecipeEvent(context, state, { name: "recipe.event", data: { ok: true } });
```

::: details Internal Mechanics: Packs & Flows
**Note**: These are implementation details. Publicly, every exported recipe is a unified handle with the same surface.

Internally, recipes are composed using:

- `Recipe.pack(...)` - groups steps (advanced authors only, not part of the public surface).
- `Recipe.flow(...)` - stitches packs together (advanced authors only, not part of the public surface).

Pack options can also declare minimum capabilities. These requirements are merged across packs
and become the effective recipe requirements at runtime.
:::

::: details Internal API: Plugins
Packs compile down to Plugins. You rarely write these directly unless you are extending the core.

:::tabs
== TypeScript

```ts
import type { Plugin } from "#workflow";

const plugin: Plugin = {
  key: "model.openai", // Stable plugin id.
  mode: "extend", // Merge semantics when duplicates exist.
  overrideKey: "model.openai", // Explicit override target for conflict resolution.
  lifecycle: "init", // Hook lifecycle name (e.g. "init").
  capabilities: { model: { name: "gpt-4.1" } }, // Declared capabilities.
  requires: ["tools"], // Required capabilities (diagnostics + strict mode).
  emits: ["model"], // Declared artefact fragments (explain/diagnostics).
  helperKinds: ["recipe.steps"], // Helper kinds the plugin contributes.
  adapters: { model: {} }, // Adapter bundle contributions.
  hook: (payload) => console.log(payload), // Lifecycle hook handler.
};
```

== JavaScript

```js
const plugin = {
  key: "model.openai", // Stable plugin id.
  mode: "extend", // Merge semantics when duplicates exist.
  overrideKey: "model.openai", // Explicit override target for conflict resolution.
  lifecycle: "init", // Hook lifecycle name (e.g. "init").
  capabilities: { model: { name: "gpt-4.1" } }, // Declared capabilities.
  requires: ["tools"], // Required capabilities (diagnostics + strict mode).
  emits: ["model"], // Declared artefact fragments (explain/diagnostics).
  helperKinds: ["recipe.steps"], // Helper kinds the plugin contributes.
  adapters: { model: {} }, // Adapter bundle contributions.
  hook: (payload) => console.log(payload), // Lifecycle hook handler.
};
```

:::
:::
