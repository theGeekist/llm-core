---
layout: home

hero:
  name: llm-core
  text: Build AI with Recipes, not Glue.
  tagline: Define declarative flows using Recipes. Swap providers via Adapters. Stop writing spaghetti code.
  image:
    src: /logo.png
    alt: llm-core logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/hello-world
    - theme: alt
      text: Core Concepts
      link: /guide/core-concepts

features:
  - title: Recipes are Assets
    details: Define flows as named, versioned recipes. Share them across teams like npm packages.
  - title: Packs are Logic
    details: Bundle specific capabilities (like "Planning" or "Memory") into reusable internals.
  - title: Adapters are Plugs
    details: Swap OpenAI for Anthropic or LangChain for LlamaIndex without rewriting your recipe.
  - title: Execution is Deterministic
    details: The engine runs your recipe as a DAG. Every step is traced, resumable, and explainable.
---

## Stop debugging prompts. Start orchestrating logic.

`llm-core` connects your business logic to AI models without gluing them together with fragile scripts.
You define the **Recipe**, plug in the **Adapters**, and let the **Runtime** handle the execution.

## Quick start (TS/JS)

Define a flow, plug in your adapters, and run it.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core/recipes";
import { fromAiSdkModel } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";

// 1. Define your recipe (or load a standard one)
const agent = recipes.agent();

// 2. Plug in your adapters
const workflow = agent.defaults({ adapters: { model: fromAiSdkModel(openai("gpt-4o")) } }).build();

// 3. Run it
const result = await workflow.run({ input: "Build me a React app" });

if (result.status === "ok") {
  console.log(result.artefact);
}
```

:::

## Next

- [Workflow API](/reference/workflow-api)
- [Adapters API](/reference/adapters-api)
- [Runtime model](/reference/runtime)
- [Debugging & Diagnostics](/guide/debugging)
- [Unified Media Inputs](/guide/media-inputs)
