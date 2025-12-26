# Your First Workflow

This guide will show you how to build a production-ready LLM workflow in less than 20 lines of code.

We'll build a **tool-calling agent** that uses OpenAI, then we'll swap it to Anthropic without changing any business logic.

## 1. The Blank Slate

Start by importing the `Workflow` builder. This is your entry point for everything.

::: tabs
== TypeScript

```ts
import { Workflow } from "@geekist/llm-core/workflow";

// This won't run yet—it needs a recipe!
```

:::

## 2. Pick a Recipe

Recipes are declarative flows. We use `Recipe.flow` to start one.
You can define your own steps, or load a standard flow like `"agent"`.

::: tabs
== TypeScript

```ts
import { Recipe } from "@geekist/llm-core/recipes";

// "agent" is a standard Recipe flow for loop-based agents
// We capture the "flow builder" here so we can configure it.
const agent = Recipe.flow("agent");
```

:::

## 3. Add the Brain (Adapters)

Recipes are abstract. They need **Adapter Plugs** to connect to the real world.
The `"agent"` flow expects a `model` adapter.

> [!TIP] > **Adapters** are the bridge between your code and the AI ecosystem (OpenAI, Anthropic, LangChain, etc.).

::: tabs
== TypeScript

```ts
import { Recipe } from "@geekist/llm-core/recipes";
import { Adapter, fromAiSdkModel } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";

const agent = Recipe.flow("agent");

// Configure the flow with an OpenAI adapter
const workflow = agent.use(Adapter.model("openai.model", fromAiSdkModel(openai("gpt-4o")))).build();
```

:::

## 4. Run It

Build the workflow and run it with an input.

::: tabs
== TypeScript

```ts
// ... imports

const app = workflow.build();

const result = await app.run({
  input: "What is the capital of France?",
});

if (result.status === "ok") {
  console.log(result.artefact.answer); // "Paris"
}
```

:::

## 5. The "Aha" Moment: Swapping Providers

Your boss wants to switch to Anthropic? No problem.
You don't need to rewrite your agent logic. Just swap the **adapter**.

::: tabs
== TypeScript

```diff
- import { openai } from "@ai-sdk/openai";
+ import { anthropic } from "@ai-sdk/anthropic";

- const agent = Recipe.flow("agent");
+ const agent = Recipe.flow("agent");

const workflow = agent
-  .use(Adapter.model("openai.model", fromAiSdkModel(openai("gpt-4o"))))
+  .use(Adapter.model("anthropic.model", fromAiSdkModel(anthropic("claude-3-5-sonnet-20240620"))))
   .build();
```

:::

That's it. Same inputs, same outputs, different brain.

> [!TIP]
> Curious about what other adapters exist? See the **[Adapter API Reference](/reference/adapters-api)**.

## Next Steps

Now that you've built your first agent, let's understand how data actually flows through it.

- [Core Concepts](/guide/core-concepts) -> Visualizing the pipeline
- [RAG Recipe](/recipes/rag) -> Building a chat-with-docs app
