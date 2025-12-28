# Composing Recipes

**Recipes** are composable units of behavior. Most users share and reuse full recipes.
Packs exist for advanced authors who want to define new step-level logic.

## The Mental Model

A Recipe is a container for steps (via packs). You compose recipes together.

```ts
import { recipes } from "#recipes";

const workflow = recipes
  .agent()
  .use(recipes.rag()) // Retrieval + synthesis
  .use(recipes.hitl()); // Pause for approval
```

> [!TIP]
> See the **[Packs & Recipes Reference](/reference/packs-and-recipes)** for the full API on `.step()`, `.priority()`, and `.override()`.

## Tutorial: Swapping the Brain

Let's say you like the standard **Agent Recipe**, but you want to replace its "Planning" logic with your own version.

### 1. Import Recipes

You compose recipes via the unified handle.

::: tabs
== TypeScript

```ts
import { recipes } from "#recipes";

const agent = recipes.agent();
```

:::

### 2. Override the Planning Recipe

The standard agent uses a complex `PlanningPack`. Let's override it with a custom one.

::: tabs
== TypeScript

```ts
import { recipes } from "#recipes";

const agent = recipes
  .agent()
  .use(recipes["agent.planning"]()) // overrides the default planning pack
  .build();
```

:::

## Extending Behavior (Advanced)

Custom packs are an internal authoring primitive. Most users compose recipes and override existing packs via `.use(...)`.
If you need step-level authoring, treat it as an internal API and follow the packs reference.

## Execution Order

Steps are executed based on a strict hierarchy:

1.  **Dependencies**: If `B` depends on `A`, `A` always runs first.
2.  **Priority**: Higher `priority` runs earlier (if dependencies allow).
3.  **Alphabetical**: If both above are equal, steps run alphabetically by name (deterministic).

::: tabs
== TypeScript

```ts
import { recipes } from "#recipes";

const plan = recipes.agent().plan();
console.log(plan.steps);
```

:::

## Next Steps

As you build more complex recipes with overrides and priority steps, you'll need to know what's happening under the hood.

- [Debugging & Diagnostics](/guide/debugging) -> Learn how to trace execution and enforce strict mode.
