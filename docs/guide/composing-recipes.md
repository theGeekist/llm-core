# Composing Recipes

If you have ever rewritten an entire bot because you wanted to change the prompt structure, you know why composition matters.

`llm-core` treats recipes as **assets**. You can reuse a recipe across your company and only override the specific parts you need to change. This lets you build a library of proven capabilities (RAG, Agent, Ingest) and mix them safely.

## 1) The composition contract

A recipe is a collection of Packs. Each Pack owns a clear responsibility such as planning, retrieval, memory, or finalisation.

When you compose recipes, you usually follow one of two patterns.

1. Add capabilities. For example, start with an agent and give it RAG.
2. Override capabilities. For example, keep the standard agent and supply a different planning policy.

Both patterns use the same surface, the `.use()` method. That method plugs in a new Pack or recipe while the rest of the workflow remains intact.

---

## 2) Adding capabilities (RAG example)

Imagine a standard agent that already handles tools and conversation. You want it to work with your company documents as well. The agent stays the same while the RAG recipe supplies retrieval.

```ts
import { recipes } from "#recipes";

// Start with the standard agent
const workflow = recipes
  .agent()
  // Add the RAG capability
  .use(recipes.rag())
  // Add a human approval gate
  .use(recipes.hitl())
  .build();
```

Here the agent recipe provides the agent loop. The RAG recipe supplies a retrieval tool. The human‑in‑the‑loop recipe adds an approval step.

Recipes register their steps with explicit names. The pipeline builder merges those steps into a single execution graph, so the agent loop calls the RAG tool when needed and passes through the approval gate before finalising an answer. The result behaves like one cohesive workflow that still remains easy to inspect.

---

## 3) Overriding behaviour (Packs)

Sometimes the overall shape of a recipe feels right while a single decision needs to change. A common example is an agent where the loop works well and the planning style needs to reflect an internal taxonomy or tone.

In that situation you focus on the Planning Pack.

```ts
import { recipes } from "#recipes";

const workflow = recipes
  .agent()
  // Replaces the default planning pack with your custom logic
  .use(
    recipes["agent.planning"]({
      model: "reasoning-specialist",
      prompt: myCustomPrompt,
    }),
  )
  .build();
```

Here the agent recipe still supplies tools, memory, and finalisation. The Planning Pack now uses a dedicated model and prompt that fit your domain. Planning becomes a slot you fill with your own logic while the rest of the recipe continues to benefit from upstream improvements.

---

## 4) Inspecting the result

As composition grows richer you may wonder what the final workflow looks like.

The `.explain()` method answers that question. It returns the resolved list of steps after all recipes and Packs have been applied.

```js
const plan = workflow.explain();
console.log(plan.steps);
// [
//   { id: "agent.planning.plan", ... },
//   { id: "agent.tools.tool-call", ... }
// ]
```

You can log or snapshot this plan in tests and deploy pipelines with a clear view of what will run in production.

---

## 5) Why this matters for teams

This model helps platform and product teams meet in the middle.

Platform teams can publish a core Security Agent recipe that already handles authentication, auditing, logging, and other guard rails.

Product teams can import that agent recipe and override only the Packs that express product‑specific behaviour, such as the system prompt, planning rules, or retrieval configuration.

Every product surface inherits the same compliant, observable agent. When the platform team improves the shared recipe, for example with enhanced logging or stricter tool policies, all dependent products gain those improvements on their next build while keeping their local customisation.
