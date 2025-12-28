# Recipe: Ingest (ETL for RAG)

> [!NOTE] > **Goal**: Convert raw sources into vector records, with clear stages and observable failures.

Ingest is a classic ETL flow (load -> split -> embed -> index) built as a **recipe**.
It is designed for repeatable ingestion and incremental re-runs.

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
const ingest = recipes.ingest().configure({
  defaults: {
    adapters: { loader, textSplitter, embedder, vectorStore },
  },
} satisfies IngestConfig);
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

Related: [Recipe handles](/reference/recipes-api#recipe-handles-the-public-surface) - [Adapters overview](/reference/adapters) - [Runtime -> Diagnostics](/reference/runtime#diagnostics)

---

## 3) Mix-and-match adapters

Ingest is adapter-agnostic: you can load with LangChain, embed with AI SDK, and index with
any supported vector store adapter.

See the supported adapter shapes in [Adapters overview](/reference/adapters).

---

## 4) Diagnostics + trace

Ingest returns full diagnostics and trace on every run. Strict mode turns warnings into failures.

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

---

## 5) Power: reuse + plan

You can inspect the full ETL DAG with `plan()`.

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

---

## Implementation

- Source: [`src/recipes/ingest/index.ts`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/ingest/index.ts)
