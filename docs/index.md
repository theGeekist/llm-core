---
layout: home

hero:
  name: llm-core
  text: Build real AI products, not prompt spaghetti
  tagline: Recipes for workflows, interactions for UI turns, adapters for providers — all deterministic and composable.
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

## Why llm-core is different

- **Deterministic by design**: every run is traceable, resumable, and explainable.
- **Agnostic at the edges**: swap models, retrievers, or UI SDKs without rewrites.
- **Two runtimes, one mental model**: workflows for depth, interactions for UI speed.

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

## Build paths

Pick a path and grow from there — each one uses the same primitives (recipes, interactions, adapters).

- **Production chat UI**: Single turn → sessions → UI adapters in one flow. Start at [Single-Turn Interaction](/guide/interaction-single-turn).
- **RAG assistant**: retrieval + citations with a standard pack. Start at [RAG Recipe](/recipes/rag).
- **Human-in-the-loop workflows**: pause/resume gates for safe actions. Start at [HITL Recipe](/recipes/hitl).
- **Batch ingestion**: structured pipelines for indexing and enrichment. Start at [Ingest Recipe](/recipes/ingest).
- **Provider-agnostic model lab**: swap models and retrievers without refactors. Start at [Adapters](/adapters/).
