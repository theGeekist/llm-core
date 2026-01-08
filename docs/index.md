---
layout: home

hero:
  name: llm-core
  text: Build AI Apps with Recipes + Interactions
  tagline: Compose workflows, run single-turn interactions, swap providers with adapters. Keep logic deterministic.
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
  - title: Interactions are Projections
    details: Turn model/query streams into UI-ready state without pulling in the full workflow runtime.
  - title: Execution is Deterministic
    details: The engine runs your recipe as a DAG. Every step is traced, resumable, and explainable.
---

## Stop debugging prompts. Start orchestrating logic.

`llm-core` connects your business logic to AI models without fragile scripts.
Use **Recipes** for long-running workflows, **Interactions** for single-turn UI state, and **Adapters**
to swap providers safely.

## Quick start (workflows)

Define a flow, plug in your adapters, and run it.

```js
import { recipes } from "@geekist/llm-core/recipes";
import { fromAiSdkModel } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";

// 1. Define your recipe (or load a standard one)
const agent = recipes.agent();

// 2. Plug in your adapters
const model = fromAiSdkModel(openai("gpt-4o"));
const workflow = agent.defaults({ adapters: { model } }).build();

// 3. Run it
const result = await workflow.run({ input: "Build me a React app" });

if (result.status === "ok") {
  console.log(result.artefact);
}
```

## Quick start (interactions)

Use the interaction core when you want UI-ready state for a single turn.

<<< @/snippets/interaction/quick-start.js#docs

## Interaction stack (what’s new)

- **Interaction Core**: deterministic event → state projection for chat UIs.
- **Sessions**: storage + policy orchestration without runtime defaults.
- **UI SDK adapters**: AI SDK, assistant-ui, ChatKit.
- **Host glue**: Node SSE + Edge/Worker stream patterns.
