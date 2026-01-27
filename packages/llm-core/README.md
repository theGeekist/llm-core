# @geekist/llm-core

Build real AI products with recipes, interactions, and adapters.

[![CI](https://github.com/theGeekist/llm-core/actions/workflows/ci.yml/badge.svg)](https://github.com/theGeekist/llm-core/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/theGeekist/llm-core/branch/main/graph/badge.svg)](https://codecov.io/gh/theGeekist/llm-core)
[![SonarCloud](https://sonarcloud.io/api/project_badges/measure?project=theGeekist_llm-core&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=theGeekist_llm-core)
[![Docs](https://img.shields.io/badge/docs-llm--core.geekist.co-0b0f14?style=flat&labelColor=0b0f14&color=f5c451)](https://llm-core.geekist.co/)

> Runtime-agnostic core for deterministic workflows and UI-ready interactions.

---

## Docs

- Docs: https://llm-core.geekist.co
- Guide (hero path): https://llm-core.geekist.co/guide/interaction-single-turn
- API: https://llm-core.geekist.co/reference/recipes-api

---

## Install

```bash
bun add @geekist/llm-core
pnpm add @geekist/llm-core
npm install @geekist/llm-core
yarn add @geekist/llm-core
```

```bash
deno add npm:@geekist/llm-core
```

---

## Quick start (interaction, single turn)

```js
import { fromAiSdkModel } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";
import {
  createInteractionPipelineWithDefaults,
  runInteractionPipeline,
} from "@geekist/llm-core/interaction";

const model = fromAiSdkModel(openai("gpt-4o-mini"));
const pipeline = createInteractionPipelineWithDefaults();

const result = await runInteractionPipeline(pipeline, {
  input: { message: { role: "user", content: "Hello!" } },
  adapters: { model },
});

if ("__paused" in result && result.__paused) {
  throw new Error("Interaction paused.");
}

console.log(result.artefact.messages[1]?.content);
```

## Quick start (workflow recipe)

```js
import { recipes } from "@geekist/llm-core/recipes";
import { fromAiSdkModel } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";

const model = fromAiSdkModel(openai("gpt-4o-mini"));
const workflow = recipes.agent().defaults({ adapters: { model } }).build();

const result = await workflow.run({ input: "Draft a short README for a new SDK." });

if (result.status === "ok") {
  console.log(result.artefact);
}
```

## Build paths

- Production chat UI: https://llm-core.geekist.co/guide/interaction-single-turn
- Sessions + transport: https://llm-core.geekist.co/guide/interaction-sessions
- End-to-end UI: https://llm-core.geekist.co/guide/end-to-end-ui
- Workflow orchestration: https://llm-core.geekist.co/guide/hello-world
- Recipes: https://llm-core.geekist.co/recipes/simple-chat
- Adapters: https://llm-core.geekist.co/adapters/

- **State validation**

  - Optional recipe-level state validator:

    - `Recipe.flow("rag").use(pack).state(validate).build();`

  - On `ok` outcomes, the validator can annotate diagnostics and emit a `recipe.state.invalid` trace event if something looks off.

- **Event conventions**

  - Helper to emit recipe events into both:

    - The adapter event stream (`eventStream.emit` / `emitMany`).
    - A `state.events` array for later inspection in tests or tools.

- **Human-in-the-loop (HITL) gate**

  - Built-in `hitl-gate` recipe and pack:

    - Emits pause tokens and `pauseKind: "human"`.
    - Lets you pause a flow, wait for a human decision, and resume.

- **Testability**

  - Runtime and helpers are designed to be extremely test-friendly.
  - The repo ships with high coverage (see Codecov badge) and static analysis (SonarCloud).

---

## Adapters today

You can use `llm-core` with:

- **LangChain**

  - Models, embeddings, text splitters, memory, vector stores.
  - Trace integration for LangChain runs.

- **LlamaIndex**

  - Document stores, vector stores, embeddings, memory.

- **AI SDK**

  - Models and embeddings, plugged in as adapters.

- **Core primitives**

  - KV store
  - Cache
  - Event stream
  - Text splitter
  - Loader
  - Vector store
  - Memory

Adapters are pluggable; you can write your own functions that match the adapter types and wire in any provider you like.

See the [docs site](https://llm-core.geekist.co/) for up-to-date adapter details and examples.

---

## Docs

- Docs site: **[https://llm-core.geekist.co/](https://llm-core.geekist.co/)**
- Workflow & recipes: `docs/workflow-api.md`, `docs/reference/packs-and-recipes.md`
- Adapters: `docs/adapters-api.md`
- Examples:

  - ETL: `docs/examples/etl-pipeline.ts`
  - Agent / RAG examples (and more) on the docs site

---

## Development

```bash
bun install

# Static checks
bun run lint
bun run typecheck

# Tests
bun test
```

The CI pipeline also runs coverage and static analysis (Codecov + SonarCloud).

---

## Status

Active development.
APIs are reasonably stable but may still evolve as more adapters and recipes land.
Check the docs site and CHANGELOG for breaking changes.

---

## Licence

Licensed under the **Apache License, Version 2.0**.

See the `LICENSE` file for details.
