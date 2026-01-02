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

```js
import { recipes } from "#recipes";

const workflow = recipes
  .agent()
  .use(recipes.rag()) // Retrieval + synthesis
  .use(recipes.hitl()); // Pause for approval
```

> [!TIP]
> For the full mental model of how steps and packs interact, and the full API on `.step()`, `.priority()`, and `.override()`, see [Composition Model](/reference/composition-model).

## Tutorial: Swapping the Brain

Let's say you like the standard **Agent Recipe**, but you want to replace its "Planning" logic with your own version.

### 1. Import Recipes

You compose recipes via the unified handle.

::: tabs
== TypeScript

```ts
import { recipes } from "#recipes";

const agent = recipes.agent();
type AgentRecipeConfig = Parameters<typeof agent.configure>[0];
```

== JavaScript

```js
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

type Runtime = Parameters<typeof agent.run>[1];
```

== JavaScript

```js
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

type RecipePlan = {
  name: string;
  steps: Array<{ id: string; dependsOn: string[] }>;
};

const plan: RecipePlan = recipes.agent().plan();
console.log(plan.steps);
```

== JavaScript

```js
import { recipes } from "#recipes";

const plan = recipes.agent().plan();
console.log(plan.steps);
```

:::

## Key Takeaways

- [ ] **Start Standard**: Use `recipes.agent()` or similar for 90% of cases.
- [ ] **Configure Behavior**: Use `.configure()` for prompts, roles, and strategy.
- [ ] **Wire Infra**: Use `.defaults()` for adapters (LLMs, Databases).
- [ ] **Override Runtime**: pass a second arg to `.run()` to swap adapters per-request.

## Next Steps

- [Debugging & Tracing](/guide/debugging) -> How to fix it when it breaksce execution and enforce strict mode.
