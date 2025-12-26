# Composing Recipes

# Composing Recipes

**Recipes** are just collections of **Packs**.
This means you can share logic across teams by publishing Packs (like "ResearchPack" or "CompliancePack") and mixing them into any workflow.

If you are open-sourcing logic built with `llm-core`, you publish Packs.

## The Mental Model

A Recipe is just a container. You fill it with Packs.

```ts
const workflow = Recipe.flow("custom-agent")
  .use(PlanningPack) // Logic for thinking
  .use(ExecutionPack) // Logic for doing
  .use(MemoryPack); // Logic for remembering
```

> [!TIP]
> See the **[Packs & Recipes Reference](/reference/packs-and-recipes)** for the full API on `.step()`, `.priority()`, and `.override()`.

## Tutorial: Swapping the Brain

Let's say you like the standard **Agent Recipe**, but you want to replace its "Planning" logic with your own simpler version.

### 1. Import the Recipe Flow

Instead of `Workflow.recipe`, we use `Recipe.flow` to access the composable builder.

::: tabs
== TypeScript

```ts
import { Recipe } from "#recipes";

const agent = Recipe.flow("agent");
```

:::

### 2. Override a Pack

The standard agent uses a complex `PlanningPack`. Let's override it with a custom one.

::: tabs
== TypeScript

```ts
import { Recipe } from "#recipes";

// Define a simple custom pack
const SimplePlanPack = Recipe.pack("planning", ({ step }) => ({
  plan: step("plan", async ({ context }) => {
    context.plan = "Do everything immediately.";
  }),
}));

// Compose the agent
const agent = Recipe.flow("agent")
  .use(SimplePlanPack) // <--- This overrides the default "planning" pack!
  .build();
```

:::

## Extending Behavior

You can also just **add** steps to an existing pack without replacing it.

::: tabs
== TypeScript

```ts
import { Recipe } from "#recipes";

const SafetyPack = Recipe.pack("safety", ({ step }) => ({
  check: step("check", async ({ input }) => {
    if (input.includes("danger")) throw new Error("Unsafe!");
  }).priority(100), // Run before everything else
}));

const safeAgent = Recipe.flow("agent").use(SafetyPack).build();
```

````

## Execution Order

Steps are executed based on a strict hierarchy:

1.  **Dependencies**: If `B` depends on `A`, `A` always runs first.
2.  **Priority**: Higher `priority` runs earlier (if dependencies allow).
3.  **Alphabetical**: If both above are equal, steps run alphabetically by name (deterministic).

::: tabs
== TypeScript
```ts
const MyPack = Recipe.pack("lifecycle", ({ step }) => ({
  first: step("first", ...).priority(100),
  second: step("second", ...).priority(10),
  last: step("last", ...).dependsOn("first"), // DAG wins over priority
}));
````

:::

## Next Steps

As you build more complex recipes with overrides and priority steps, you'll need to know what's happening under the hood.

- [Debugging & Diagnostics](/guide/debugging) -> Learn how to trace execution and enforce strict mode.
