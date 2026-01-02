# Your First Workflow

This guide will show you how to build a production-ready LLM workflow in less than 20 lines of code.

We'll build a **tool-calling agent** (a loop that can use tools to solve problems) that uses OpenAI, then we'll swap it to Anthropic without changing any business logic.

## 1. The Blank Slate

To build anything, we need the standard library. Start by importing the `recipes` handle. This gives you access to pre-built logic blueprints.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core/recipes";
import type { AgentRecipeConfig } from "@geekist/llm-core/recipes";

// Example: keep a typed config around
const config: AgentRecipeConfig = {};
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core/recipes";
```

:::

## 2. Pick a Recipe

**Recipes** are declarative blueprints for your workflow. We use `recipes.*()` to start one.
You can define your own logic later, but we'll load a standard **Agent Recipe**—a pre-built loop that knows how to think and act.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core/recipes";

// "agent" is a standard recipe for loop-based agents.
const agent = recipes.agent();

type AgentRecipeConfig = Parameters<typeof agent.configure>[0];
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core/recipes";

// "agent" is a standard recipe for loop-based agents.
const agent = recipes.agent();
```

:::

## 3. Add the Brain (Adapters)

Recipes define _logic_, but they need **Adapters** to talk to the real world.
The `"agent"` flow expects a `model` adapter—a unified interface that wraps any LLM provider.

> [!TIP] > **Adapters** are like power plugs. They let your standard recipe connect to the specific AI ecosystem (OpenAI, Anthropic, LangChain, etc.) you want to use.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core/recipes";
import { fromAiSdkModel } from "@geekist/llm-core/adapters";
import type { Model } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";

const model: Model = fromAiSdkModel(openai("gpt-4o"));

// Configure the recipe with an OpenAI adapter
const workflow = recipes.agent().defaults({ adapters: { model } }).build();
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core/recipes";
import { fromAiSdkModel } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";

const model = fromAiSdkModel(openai("gpt-4o"));

// Configure the recipe with an OpenAI adapter
const workflow = recipes.agent().defaults({ adapters: { model } }).build();
```

:::

## 4. Run It

Build the workflow and run it with an input.

::: tabs
== TypeScript

```ts
// ... imports

const result = await workflow.run({
  input: "What is the capital of France?",
});

if (result.status === "ok") {
  const answer: string | undefined = result.artefact.answer;
  console.log(answer); // "Paris"
}
```

== JavaScript

```js
// ... imports

const result = await workflow.run({
  input: "What is the capital of France?",
});

if (result.status === "ok") {
  console.log(result.artefact.answer); // "Paris"
}
```

:::

## 5. The "Aha" Moment: Swapping Providers

Your boss wants to switch to Anthropic? No problem.
Your agent logic remains unchanged. Just swap the **adapter**.

::: tabs
== TypeScript

```diff
- import { openai } from "@ai-sdk/openai";
+ import { anthropic } from "@ai-sdk/anthropic";

- const model = fromAiSdkModel(openai("gpt-4o"));
+ const model = fromAiSdkModel(anthropic("claude-3-5-sonnet-20240620"));

const workflow = recipes.agent().defaults({ adapters: { model } }).build();
```

== JavaScript

```diff
- import { openai } from "@ai-sdk/openai";
+ import { anthropic } from "@ai-sdk/anthropic";

- const model = fromAiSdkModel(openai("gpt-4o"));
+ const model = fromAiSdkModel(anthropic("claude-3-5-sonnet-20240620"));

const workflow = recipes.agent().defaults({ adapters: { model } }).build();
```

:::

That's it. Same inputs, same outputs, different brain.

> [!TIP]
> Curious about what other adapters exist? See the **[Adapter API Reference](/reference/adapters-api)**.

## Key Takeaways

- [ ] **Recipes** are the blueprint (logic).
- [ ] **Adapters** are the plugs (providers).
- [ ] **Swapping** offers resilience without code rewrites.

## Next Steps

Now that you've built your first agent, let's understand how data actually flows through it.

- [Core Concepts](/guide/core-concepts) -> Visualizing the pipeline
- [Building a Chatbot](/recipes/simple-chat) -> See more recipe options
- [Adapters Overview](/adapters/) -> See supported providers
- [Why llm-core?](/guide/philosophy) -> Understand the design philosophy
- [RAG Recipe](/recipes/rag) -> Building a chat-with-docs app
