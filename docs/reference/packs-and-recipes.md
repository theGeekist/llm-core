# Packs, Recipes & Plugins

This reference covers the compositional layer of `llm-core`.

- **Packs**: Composable units of logic (Steps).
- **Recipes**: Pre-configured Flows made of Packs.
- **Plugins**: The low-level implementation units (capabilities, hooks).

## 1. Pack API

A **Pack** is a named bundle of **Steps**.

::: tabs
== TypeScript

```ts
import { Recipe } from "#recipes";

const MyPack = Recipe.pack("planning", ({ step }) => ({
  // Define steps
  plan: step("plan", async ({ context }) => { ... }),
  review: step("review", async ({ context }) => { ... }).dependsOn("plan"),
}));
```

:::

### Step Definition

- `step(name, handler)`: Creates a step.
- `.dependsOn(name)`: Declares topology (Primary sorting).
- `.priority(n)`: Sets execution order (Secondary sorting; higher runs earlier).
- `.override()` / `.extend()`: Sets merge mode.

## 2. Recipe Flow API

The **Flow** builder stitches Packs together.

::: tabs
== TypeScript

```ts
import { Recipe } from "#recipes";

const agent = Recipe.flow("agent")
  .use(PlanningPack)
  .use(ExecutionPack)
  .defaults({
    adapters: { model: ... }
  });
```

:::

## 3. Standard Packs & Recipes

### 1) Agent Recipe

Composed of:

- `planning` Pack: Decides what to do.
- `tools` Pack: Executes tool calls.
- `memory` Pack: Managing conversation history.

### 2) RAG Recipe

Composed of:

- `retrieval` Pack: Fetching documents.
- `generation` Pack: Synthesizing the answer.

## 4. Plugin API (Low Level)

Packs compile down to Plugins. You rarely write these by hand unless you are building foundational capabilities.

::: tabs
== TypeScript

```ts
type Plugin = {
  key: string;
  lifecycle?: string;
  capabilities?: Record<string, unknown>;
  hook?: (payload: unknown) => void;
};
```

:::
