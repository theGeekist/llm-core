# Recipe: Ingest (ETL for RAG)

> [!NOTE] > **Goal**: Convert raw sources into vector records, with clear stages and observable failures.

Ingest is a classic ETL flow (load -> split -> embed -> index) built as a **recipe**.
It is designed for repeatable ingestion and incremental re-runs, the “write path” that powers
every serious RAG system. You use it when you want to bring new knowledge into a vector store
without embedding glue into your application code.

```mermaid
flowchart LR
  Source[(Raw docs)] --> Load[Load]
  Load --> Split[Split]
  Split --> Embed[Embed]
  Embed --> Index[Index]
```

Typical use cases include nightly policy syncs, product documentation refreshes, onboarding new
datasets, or batch ingestion for a new tenant. If RAG is the read path, ingest is the write path.

---

## 1) Quick start (loader + splitter + embedder + store)

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";
import {
  fromLangChainLoader,
  fromLangChainTextSplitter,
  fromAiSdkEmbeddings,
  fromLangChainVectorStore,
} from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

const loader = fromLangChainLoader(new PDFLoader("./my-book.pdf"));
const textSplitter = fromLangChainTextSplitter(
  new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 200 }),
);
const embedder = fromAiSdkEmbeddings(openai.embedding("text-embedding-3-small"));
const vectorStore = fromLangChainVectorStore(
  await MemoryVectorStore.fromTexts(["seed"], [{ id: "seed" }], new OpenAIEmbeddings()),
);

const ingest = recipes.ingest().defaults({
  adapters: { loader, textSplitter, embedder, vectorStore },
});

const outcome = await ingest.run({
  sourceId: "docs:book",
  documents: [{ id: "intro", text: "Hello world." }],
});
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";
import {
  fromLangChainLoader,
  fromLangChainTextSplitter,
  fromAiSdkEmbeddings,
  fromLangChainVectorStore,
} from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

const loader = fromLangChainLoader(new PDFLoader("./my-book.pdf"));
const textSplitter = fromLangChainTextSplitter(
  new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 200 }),
);
const embedder = fromAiSdkEmbeddings(openai.embedding("text-embedding-3-small"));
const vectorStore = fromLangChainVectorStore(
  await MemoryVectorStore.fromTexts(["seed"], [{ id: "seed" }], new OpenAIEmbeddings()),
);

const ingest = recipes.ingest().defaults({
  adapters: { loader, textSplitter, embedder, vectorStore },
});

const outcome = await ingest.run({
  sourceId: "docs:book",
  documents: [{ id: "intro", text: "Hello world." }],
});
```

:::

Outcomes are explicit: `{ status, artefact, diagnostics, trace }`. A successful run carries
`ingest.chunks`, `ingest.embeddings`, and `ingest.upserted` in the artefact, alongside trace and
diagnostics that explain what happened at each stage. Errors and pauses keep the same trace and
diagnostics attached, so ingestion is always explainable.

If you want a minimal “success‑path” check, this is enough:

```ts
if (outcome.status === "ok") {
  console.log(outcome.artefact["ingest.upserted"]);
}
```

---

## 2) Configure per-pack defaults (typed)

Ingest exposes a single config for pack-level defaults. Use it when you want stable wiring
and only override on a per-run basis.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";
import type { IngestConfig } from "@geekist/llm-core/recipes";

// Reuse loader/textSplitter/embedder/vectorStore from the quick start.
const config = {
  defaults: {
    adapters: { loader, textSplitter, embedder, vectorStore },
  },
} satisfies IngestConfig;

const ingest = recipes.ingest().configure(config);
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";

// Reuse loader/textSplitter/embedder/vectorStore from the quick start.
const ingest = recipes.ingest().configure({
  defaults: {
    adapters: { loader, textSplitter, embedder, vectorStore },
  },
});
```

:::

Related: [Recipe handles](/reference/recipes-api#recipe-handles-the-public-surface) and
[Adapters overview](/adapters/).

This is where you tune the pipeline: chunk size and overlap on the splitter, which embedder to use,
and how the vector store should upsert. Keep run input small; keep behaviour in config.
If you need strict enforcement, run with `runtime.diagnostics = "strict"` so missing adapters or
invalid inputs become errors instead of warnings.

Common tweaks include: smaller chunk sizes for precise retrieval, larger chunks for narrative continuity,
and explicit metadata preservation so citations remain stable. If your embedder supports `embedMany`,
use it — the recipe will take advantage of it automatically.

---

## 3) Mix-and-match adapters

Ingest is adapter-agnostic: you can load with LangChain, embed with AI SDK, and index with
any supported vector store adapter. That lets you swap providers without rewriting ingestion code,
which is especially useful when you migrate vector stores or embedding models.

For example, a real‑world mix might be: LangChain loader + LlamaIndex splitter + AI SDK embeddings +
LlamaIndex vector store. The ingest recipe doesn’t care which ecosystem each adapter came from.

See supported adapter shapes in [Adapters overview](/adapters/).

---

## 4) Diagnostics + trace

Ingest returns full diagnostics and trace on every run. Strict mode turns warnings into failures, which
is a safer default for ingestion pipelines that must be correct. This is where loader errors, invalid
metadata, or failed upserts surface immediately.

::: tabs
== TypeScript

```ts
// ingest handle from above
const outcome = await ingest.run(
  { sourceId: "docs:book", documents: [{ id: "intro", text: "Hello world." }] },
  { runtime: { diagnostics: "strict" } },
);

console.log(outcome.diagnostics);
console.log(outcome.trace);
```

== JavaScript

```js
// ingest handle from above
const outcome = await ingest.run(
  { sourceId: "docs:book", documents: [{ id: "intro", text: "Hello world." }] },
  { runtime: { diagnostics: "strict" } },
);

console.log(outcome.diagnostics);
console.log(outcome.trace);
```

:::

Related: [Runtime -> Diagnostics](/reference/runtime#diagnostics) and
[Runtime -> Trace](/reference/runtime#trace).

---

## 5) Power: reuse + plan

You can inspect the full ETL DAG with `plan()`.

```mermaid
flowchart LR
  Seed[ingest.seed] --> Load[ingest.load]
  Seed --> Split[ingest.split]
  Load --> Split
  Split --> Embed[ingest.embed]
  Embed --> Index[ingest.index]
```

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";

const plan = recipes.ingest().plan();
console.log(plan.steps.map((step) => step.id));
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";

const plan = recipes.ingest().plan();
console.log(plan.steps.map((step) => step.id));
```

:::

Ingest composes cleanly with other recipes. Run it before [RAG](/recipes/rag) to refresh the knowledge
base, or pair it with [Agent](/recipes/agent) when you want “ingest then answer” as a single flow.

A common pattern is “ingest nightly, rag on demand.” Another is “ingest on upload, then agent answers
immediately,” which is how you build instant Q&A over new documents.

```mermaid
flowchart LR
  Ingest[Ingest] --> RAG[RAG]
  RAG --> Agent[Agent]
```

```mermaid
flowchart LR
  Docs[Documents] --> Chunks[ingest.chunks]
  Chunks --> Embeddings[ingest.embeddings]
  Embeddings --> Upserted[ingest.upserted]
```

The mental model is simple: deterministic steps, swappable adapters, and a plan that is always visible.
You get the same runtime guarantees here as everywhere else — explicit outcomes, diagnostics, and trace.

---

## 6) Why Ingest is special

Ingest is the only recipe that is explicitly a write‑path. It transforms raw documents into
vector records and upserts them into a store, which is why it benefits most from strict diagnostics
and stable adapters. If you care about idempotent re‑ingest, this is where `sourceId` and stable
chunk identities matter. It is the foundation for any reliable RAG system.

---

## Implementation

- Source: [`src/recipes/ingest/index.ts`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/ingest/index.ts)
