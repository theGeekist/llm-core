# @geekist/llm-core

Composable workflow + adapter core for the JS/TS LLM ecosystem.

[![CI](https://github.com/theGeekist/llm-core/actions/workflows/ci.yml/badge.svg)](https://github.com/theGeekist/llm-core/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/theGeekist/llm-core/branch/main/graph/badge.svg)](https://codecov.io/gh/theGeekist/llm-core)
[![SonarCloud](https://sonarcloud.io/api/project_badges/measure?project=theGeekist_llm-core&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=theGeekist_llm-core)
[![Docs](https://img.shields.io/badge/docs-llm--core.geekist.co-0b0f14?style=flat&labelColor=0b0f14&color=f5c451)](https://llm-core.geekist.co/)

> Small runtime, opinionated wiring. Recipes, adapters, and rollbacks for LLM workflows that actually behave.

---

## What is this?

`llm-core` is a **workflow + adapter layer** that sits under your LLM code:

- You write **recipes** (`agent`, `rag`, `ingest`, `hitl-gate`, `compress`, `chat.simple`, etc.).
- You plug in **adapters** (LangChain, LlamaIndex, AI SDK, vector stores, text splitters, memory…).
- You get a **deterministic flow runtime** with rollbacks, pause/resume, diagnostics, and trace events.

You **do not** need to think about “packs, flows, handles, contracts, capabilities, rollback, state validation, events, maybe helpers…” unless you want to.  
Most users will only ever touch **recipe handles**.

---

## Why

LLM tooling is fragmented and very framework-shaped. `llm-core` tries to fix that with **principled orchestration**:

- **Cross-ecosystem adapters**  
  Plug into LangChain, LlamaIndex, or AI SDK from the same workflow surface.

- **Recipe-first mental model**  
  “This is an `agent`” / “this is `rag`” / “this is `ingest`”, not “here’s a random script”.

- **DAG-driven flows**  
  Steps are nodes in a graph. You can reorder, extend, or override them without rewriting everything.

- **Configurable adapters instead of rewrites**  
  Swap models, retrievers, vector stores, caches, text splitters, loaders, etc. by changing config, not code.

- **MaybePromise everywhere**  
  Business logic can be sync or async; the runtime normalises it. You get sync-looking code that composes in async pipelines.

- **Deterministic behaviour**  
  Trace events and structured diagnostics instead of string logs sprinkled all over a codebase.

- **Interop-aware**  
  The repo tracks adapter parity and behaviour across ecosystems so you don’t have to guess which combination works.

---

## Install

```bash
bun add @geekist/llm-core
# or
npm install @geekist/llm-core
# or
pnpm add @geekist/llm-core
```

---

## Quick start

The easiest way in is through **recipes**.

### Example: RAG query

```ts
import { recipes } from "@geekist/llm-core";

const rag = recipes.rag()
  .defaults({
    adapters: {
      // Whatever you’re using today
      model: /* your chat/LLM model */,
      retriever: /* your retriever or vector store */,
    },
  })
  .build();

const outcome = await rag.run({ query: "What is Geekist?", input: "optional context" });

if (outcome.status === "ok") {
  console.log(outcome.artefact.Answer);
}
```

### Example: Simple chat

```ts
import { recipes } from "@geekist/llm-core";

const chat = recipes["chat.simple"]()
  .defaults({
    adapters: {
      model: /* your chat/LLM model */,
    },
  })
  .build();

const result = await chat.run({ input: "Tell me a joke about TypeScript." });

if (result.status === "ok") {
  console.log(result.artefact.Answer);
}
```

### Example: Ingest into a vector store

```ts
import { recipes } from "@geekist/llm-core";

const ingest = recipes.ingest()
  .defaults({
    adapters: {
      textSplitter: /* splitter (LangChain, LlamaIndex, or your own) */,
      embedder:     /* embeddings model (LangChain / LlamaIndex / AI SDK) */,
      vectorStore:  /* upsert-capable store */,
    },
  })
  .build();

const result = await ingest.run({
  sourceId: "docs:geekist",
  documents: [
    { id: "doc-1", text: "First document text" },
    { id: "doc-2", text: "Second document text" },
  ],
});

if (result.status === "ok") {
  console.log(`Ingested: ${result.artefact.count} documents.`);
}
```

---

## Key concepts (in plain English)

You can happily ignore this section and just use `recipes.*`.
If you’re curious how it hangs together:

- **Recipes**
  High-level “things users care about”: `agent`, `rag`, `ingest`, `hitl-gate`, `compress`, `chat.simple`, `chat.rag`, etc.

- **Packs**
  Internal building blocks for recipes. A pack is a named group of steps (e.g. `agent-planning`, `agent-tools`, `rag-retrieval`, `rag-synthesis`, `ingest`, `compress`).

- **Steps**
  Functions that read/write a shared state object and declare dependencies (`dependsOn`) to form a DAG.

- **Contracts & capabilities**
  Each recipe has a **contract** (shape of input/output) and **minimum capabilities** (e.g. `model`, `tools`, `retriever`, `vectorStore`, `hitl`).
  Packs can **raise** the minimums they need (e.g. `rag-retrieval` requires a retriever, `ingest` requires a vector store).

- **Adapters**
  Typed interop shims between `llm-core` and things like LangChain, LlamaIndex, AI SDK, or your own primitives
  (models, retrievers, vector stores, KV stores, loaders, text splitters, memory, event streams, etc.).

- **Maybe helpers**
  A small FP layer that unifies “maybe a value, maybe a promise, maybe null/undefined”.
  It keeps the runtime sane without forcing you to care about monads.

- **Runtime & trace**
  Underneath recipes is a small runtime that executes flows, manages pause/resume, emits trace events, and collects diagnostics.

Most of this is internal wiring; the **public surface stays as simple as you need it to be**.

---

## Features

Some highlights you get “for free”:

- **Recipe handles**

  - `recipes.rag()`, `recipes.agent()`, `recipes.ingest()`, `recipes["chat.simple"]()`, etc.
  - `.defaults(...)`, `.use(...)`, `.plan()`, `.build()`, `.run(...)`.

- **Pack-level requirements**

  - Packs declare `minimumCapabilities` so you can’t accidentally run a RAG flow with no retriever or an ingest flow with no vector store.
  - Requirements are checked against contracts and adapter configuration.

- **Rollback & interrupts**

  - Steps can provide rollbacks declaratively:

    - `step(...).rollback(...)` for static rollbacks.
    - `Recipe.rollback(...)` inside step implementations.

  - Used by interrupt strategies to implement graceful restart / resume semantics.

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
