---
layout: home

hero:
  name: llm-core
  text: Turn prompt spaghetti into real AI products
  tagline: A deterministic, composable core for AI workflows, UI interactions, and provider adapters.
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
    details: Define flows as named, versioned recipes and share them across teams like npm packages.
  - title: Packs are Logic
    details: Internal step groups that power recipes; most users only touch recipe handles.
  - title: Adapters are Plugs
    details: Swap OpenAI for Anthropic or LangChain for LlamaIndex while keeping your recipe unchanged.
  - title: Interactions are Projections
    details: Turn model or query streams into UI-ready state while the full workflow runtime stays behind the scenes.
  - title: Execution is Deterministic
    details: The engine runs your recipe as a DAG. Every step is traced, resumable, and explainable.
---

## Stop debugging prompts. Start orchestrating logic.

`llm-core` connects your business logic to AI models and avoids fragile scripts.
Use **Recipes** for long-running workflows, **Interactions** for single-turn UI state, and **Adapters**
to swap providers safely.

## Install

Runtime-agnostic core that works in Node, Bun, Edge, and browsers.

::: tabs
== bun

```bash
bun add @geekist/llm-core
```

== pnpm

```bash
pnpm add @geekist/llm-core
```

== npm

```bash
npm install @geekist/llm-core
```

== yarn

```bash
yarn add @geekist/llm-core
```

== deno

```bash
deno add npm:@geekist/llm-core
```

:::

Workers: install via npm, pnpm, or yarn and deploy to your worker runtime such as Cloudflare Workers or Vercel Edge.

## Why llm-core is different

- **Deterministic by design**: every run is traceable, resumable, and explainable.
- **Agnostic at the edges**: swap models, retrievers, or UI SDKs while your recipes stay intact.
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

- **Interaction Core**: deterministic event to state projection for chat UIs.
- **Sessions**: storage and policy orchestration that keeps runtime defaults out of your UI.
- **UI SDK adapters**: AI SDK, assistant-ui, ChatKit.
- **Host transport**: Node SSE and Edge or Worker stream patterns.

## Build paths

Pick a path and grow from there. Each one uses the same primitives: recipes, interactions, adapters.

- **Production chat UI**: single turn to sessions to UI adapters in one flow. Start at [Single-Turn Interaction](/guide/interaction-single-turn).
- **RAG assistant**: retrieval and citations with a standard pack. Start at [RAG Recipe](/recipes/rag).
- **Human-in-the-loop workflows**: pause and resume gates for safe actions. Start at [HITL Recipe](/recipes/hitl).
- **Batch ingestion**: structured pipelines for indexing and enrichment. Start at [Ingest Recipe](/recipes/ingest).
- **Provider-agnostic model lab**: swap models and retrievers while the pipeline stays stable. Start at [Adapters](/adapters/).
