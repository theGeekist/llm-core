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

Recipes are pre-built workflows. Instead of wiring up a DAG by hand, you just ask for a specialized blueprint.
Let's ask for an `"agent"`.

::: tabs
== TypeScript

```ts
import { Workflow } from "@geekist/llm-core/workflow";

// "agent" gives us a Loop + Tool Calling + Planning workflow
const workflow = Workflow.recipe("agent");
```

:::

## 3. Add the Brain (Adapters)

A recipe needs capabilities to run. The "agent" recipe needs a `model`.
We use `.use()` to plug in adapters.

> [!TIP] > **Adapters** are the bridge between your code and the AI ecosystem (OpenAI, Anthropic, LangChain, etc.).

::: tabs
== TypeScript

```ts
import { Workflow } from "@geekist/llm-core/workflow";
import { Adapter, fromAiSdkModel } from "#adapters";
import { openai } from "@ai-sdk/openai";

const workflow = Workflow.recipe("agent").use(
  Adapter.model("openai.model", fromAiSdkModel(openai("gpt-4o"))),
);
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

const workflow = Workflow.recipe("agent")
-  .use(Adapter.model("openai.model", fromAiSdkModel(openai("gpt-4o"))));
+  .use(Adapter.model("anthropic.model", fromAiSdkModel(anthropic("claude-3-5-sonnet-20240620"))));
```

:::

That's it. Same inputs, same outputs, different brain.

## Next Steps

Now that you've built your first agent, let's understand how data actually flows through it.

- [Core Concepts](/guide/core-concepts) -> Visualizing the pipeline
- [RAG Recipe](/recipes/rag) -> Building a chat-with-docs app
