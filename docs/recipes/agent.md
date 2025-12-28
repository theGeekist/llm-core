# Recipe: Agent (Reason + Act)

> [!NOTE] > **Goal**: Build a tool-calling agent that can plan, act, and finalize with clean diagnostics and a stable recipe surface.

The Agent recipe is the most complete example of the **recipe-first** API. It runs a ReAct-style loop:
plan -> tool-call -> tool-exec -> respond, while keeping diagnostics and trace attached to every outcome.

If you're new to recipes, read the [Recipes API](/reference/recipes-api) once, then treat this page as the
recipe-specific README.

---

## 1) Quick start (one model + one tool)

This is the minimum: a model adapter + a tool adapter, then `run()`.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";
import { fromAiSdkModel, fromAiSdkTool } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";
import { tool } from "ai";
import { z } from "zod";

const agent = recipes.agent().defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
    tools: [
      fromAiSdkTool(
        "get_weather",
        tool({
          description: "Get weather by city",
          parameters: z.object({ city: z.string() }),
          execute: async ({ city }) => ({ city, summary: "Sunny, 25C" }),
        }),
      ),
    ],
  },
});

const outcome = await agent.run({ input: "What's the weather in Tokyo?" });
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";
import { fromAiSdkModel, fromAiSdkTool } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";
import { tool } from "ai";
import { z } from "zod";

const agent = recipes.agent().defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
    tools: [
      fromAiSdkTool(
        "get_weather",
        tool({
          description: "Get weather by city",
          parameters: z.object({ city: z.string() }),
          execute: async ({ city }) => ({ city, summary: "Sunny, 25C" }),
        }),
      ),
    ],
  },
});

const outcome = await agent.run({ input: "What's the weather in Tokyo?" });
```

:::

Related: [Adapters overview](/reference/adapters) - [Adapters API](/reference/adapters-api)

---

## 2) Configure per-pack defaults (typed)

`configure()` is **recipe-specific** and scoped to the agent's internal packs (planning/tools/memory/finalize).
Use this when you want defaults that apply only to specific packs.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";
import type { AgentRecipeConfig } from "@geekist/llm-core/recipes";

const agent = recipes.agent().configure({
  tools: {
    defaults: {
      adapters: {
        tools: [
          /* tool adapters */
        ], // e.g. fromAiSdkTool(...) or fromLangChainTool(...)
      },
    },
  },
  memory: {
    defaults: {
      adapters: {
        memory: myMemoryAdapter, // e.g. fromLangChainMemory(...)
      },
    },
  },
} satisfies AgentRecipeConfig);
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";

const agent = recipes.agent().configure({
  tools: {
    defaults: {
      adapters: {
        tools: [
          /* tool adapters */
        ],
      },
    },
  },
  memory: {
    defaults: {
      adapters: {
        memory: myMemoryAdapter,
      },
    },
  },
});
```

:::

Why this exists: it keeps **pack-level defaults** separate from **run-level overrides**.
See [Recipe handles](/reference/recipes-api#recipe-handles-the-public-surface).

---

## 3) Mix-and-match adapters (ecosystem-agnostic)

You can combine adapters from different ecosystems as long as they implement the same adapter shape.
Below, the model is AI SDK while tools come from LangChain.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";
import { fromAiSdkModel, fromLangChainTool } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";
import { tool as lcTool } from "@langchain/core/tools";
import { z } from "zod";

const langChainTool = lcTool(async ({ city }: { city: string }) => ({ city, summary: "Sunny" }), {
  name: "get_weather",
  description: "Weather lookup",
  schema: z.object({ city: z.string() }),
});

const agent = recipes.agent().defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
    tools: [fromLangChainTool(langChainTool)],
  },
});
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";
import { fromAiSdkModel, fromLangChainTool } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";
import { tool as lcTool } from "@langchain/core/tools";
import { z } from "zod";

const langChainTool = lcTool(async ({ city }) => ({ city, summary: "Sunny" }), {
  name: "get_weather",
  description: "Weather lookup",
  schema: z.object({ city: z.string() }),
});

const agent = recipes.agent().defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
    tools: [fromLangChainTool(langChainTool)],
  },
});
```

:::

More on adapter compatibility: [Adapters overview](/reference/adapters).

---

## 4) Diagnostics + trace (observability you always get)

Every run returns **trace** and **diagnostics**. You can also enforce strict diagnostics at runtime.

::: tabs
== TypeScript

```ts
// agent handle from above
const outcome = await agent.run(
  { input: "Explain our refund policy." },
  { runtime: { diagnostics: "strict" } },
);

if (outcome.status === "error") {
  console.error(outcome.diagnostics);
}

console.log(outcome.trace);
```

== JavaScript

```js
// agent handle from above
const outcome = await agent.run(
  { input: "Explain our refund policy." },
  { runtime: { diagnostics: "strict" } },
);

if (outcome.status === "error") {
  console.error(outcome.diagnostics);
}

console.log(outcome.trace);
```

:::

Read more: [Runtime -> Diagnostics](/reference/runtime#diagnostics) - [Runtime -> Trace](/reference/runtime#trace)

---

## 5) Composition + plan (power without magic)

Recipes are composable. `.use()` merges packs and defaults; `.plan()` shows the resulting DAG.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";

const supportAgent = recipes.agent().use(recipes.rag()).use(recipes.hitl());

const plan = supportAgent.plan();
console.log(plan.steps.map((step) => step.id));
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";

const supportAgent = recipes.agent().use(recipes.rag()).use(recipes.hitl());

const plan = supportAgent.plan();
console.log(plan.steps.map((step) => step.id));
```

:::

Related: [Plan API](/reference/recipes-api#plan-see-the-graph) - [Packs & Recipes](/reference/packs-and-recipes)

---

## Implementation

- Source: [`src/recipes/agentic/agent/index.ts`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/agentic/agent/index.ts)
- Packs: [`src/recipes/agentic/planning`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/agentic/planning)
  - [`tools`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/agentic/tools)
  - [`finalize`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/agentic/finalize)
  - [`memory`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/agentic/memory)
