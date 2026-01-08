# Composing Recipes

This guide focuses on **composition**: how to stack recipes, override packs, and keep behavior
deterministic without rewriting flows. If you want the full orchestration story first, start here:

- [Workflow Orchestration](/guide/hello-world)

---

## 1) Working demo (compose + override)

Compose a standard agent with RAG, then override planning without touching the rest of the flow.

```ts
import { recipes } from "#recipes";

const workflow = recipes
  .agent()
  .use(recipes.rag()) // Retrieval + synthesis
  .use(recipes["agent.planning"]()) // override planning pack
  .use(recipes.hitl()) // Pause for approval
  .build();
```

```js
import { recipes } from "#recipes";

const workflow = recipes
  .agent()
  .use(recipes.rag()) // Retrieval + synthesis
  .use(recipes["agent.planning"]()) // override planning pack
  .use(recipes.hitl()) // Pause for approval
  .build();
```

---

## 2) Options and interoperability

### How it works under the hood

A recipe is a **set of packs**. Packs are named bundles of steps with deterministic ordering:
dependencies → priority → name. You compose recipes by `.use(...)`-ing packs, and you override
behaviour by reusing the **same pack id**.

### Swap adapters without changing composition

```js
const workflow = recipes
  .agent()
  .use(recipes.rag())
  .defaults({ adapters: { model, retriever } })
  .build();
```

This keeps your composition stable while you swap providers or stores.

### Mix and match packs

Packs are just steps with deterministic ordering. You can add, override, or disable them.

Some packs also introduce requirements or outcomes:

- The **RAG pack** expects a `retriever` adapter port.
- The **HITL pack** is what introduces the paused outcome.

---

## 3) Why this is better than ad-hoc composition

- **Deterministic ordering**: dependencies, priority, then name.
- **Override visibility**: `explain()` shows what replaced what.
- **Minimal surface area**: compose with `.use(...)`, configure with `.configure(...)`.

---

## 4) Inspect composition

Use `explain()` to see the final pack/step ordering.

```js
import { recipes } from "#recipes";

const plan = recipes.agent().explain();
console.log(plan.steps);
```

---

## 5) When to write custom packs

Most teams should compose existing recipes and override packs. Only author custom packs when you
need new step-level behavior.

For the full API (`step`, `priority`, `override`), see:

- [Composition Model](/reference/composition-model)

## Key Takeaways

- [ ] **Compose** with `.use(...)`, override selectively.
- [ ] **Inspect** with `explain()` for deterministic ordering.
- [ ] **Swap adapters** without touching recipe logic.
