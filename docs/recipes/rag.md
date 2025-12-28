# Recipe: RAG (Retrieval + Synthesis)

> [!NOTE] > **Goal**: Answer questions using private data by composing retrieval and synthesis into a single recipe.

RAG in llm-core is **two recipes working together**: retrieval fetches documents, synthesis turns them into an answer.
This page walks from "just run it" to mix-and-match adapters and observability.

---

## 1) Quick start (retriever + model)

Use a LangChain retriever and an AI SDK model in the same run.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";
import { fromAiSdkModel, fromLangChainRetriever } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

const vectorStore = await MemoryVectorStore.fromTexts(
  ["Refunds are issued within 30 days."],
  [{ id: "policy" }],
  new OpenAIEmbeddings(),
);

const rag = recipes.rag();

const outcome = await rag.run(
  { input: "What is the refund policy?" },
  {
    adapters: {
      retriever: fromLangChainRetriever(vectorStore.asRetriever()),
      model: fromAiSdkModel(openai("gpt-4o-mini")),
    },
  },
);
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";
import { fromAiSdkModel, fromLangChainRetriever } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

const vectorStore = await MemoryVectorStore.fromTexts(
  ["Refunds are issued within 30 days."],
  [{ id: "policy" }],
  new OpenAIEmbeddings(),
);

const rag = recipes.rag();

const outcome = await rag.run(
  { input: "What is the refund policy?" },
  {
    adapters: {
      retriever: fromLangChainRetriever(vectorStore.asRetriever()),
      model: fromAiSdkModel(openai("gpt-4o-mini")),
    },
  },
);
```

:::

Related: [Adapters overview](/reference/adapters) - [Recipes API](/reference/recipes-api)

---

## 2) Configure per-pack defaults (typed)

RAG exposes pack-level defaults for **retrieval** and **synthesis**. Use this when you want defaults scoped to a pack.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";
import type { RagRecipeConfig } from "@geekist/llm-core/recipes";

const rag = recipes.rag().configure({
  retrieval: {
    defaults: {
      adapters: {
        retriever: myRetriever, // your retriever adapter
      },
    },
  },
  synthesis: {
    defaults: {
      adapters: {
        model: myModel, // your model adapter
      },
    },
  },
} satisfies RagRecipeConfig);
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";

const rag = recipes.rag().configure({
  retrieval: {
    defaults: {
      adapters: {
        retriever: myRetriever, // your retriever adapter
      },
    },
  },
  synthesis: {
    defaults: {
      adapters: {
        model: myModel, // your model adapter
      },
    },
  },
});
```

:::

Why this exists: [Recipe handles -> configure](/reference/recipes-api#recipe-handles-the-public-surface).

---

## 3) Mix-and-match adapters

RAG is intentionally adapter-agnostic. The quick start already mixes LangChain (retriever) + AI SDK (model).
You can swap either side without changing the recipe surface.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";
import { fromLangChainModel, fromLangChainRetriever } from "@geekist/llm-core/adapters";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

const vectorStore = await MemoryVectorStore.fromTexts(
  ["Refunds are issued within 30 days."],
  [{ id: "policy" }],
  new OpenAIEmbeddings(),
);

const rag = recipes.rag().defaults({
  adapters: {
    retriever: fromLangChainRetriever(vectorStore.asRetriever()),
    model: fromLangChainModel(new ChatOpenAI({ model: "gpt-4o-mini" })),
  },
});
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";
import { fromLangChainModel, fromLangChainRetriever } from "@geekist/llm-core/adapters";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

const vectorStore = await MemoryVectorStore.fromTexts(
  ["Refunds are issued within 30 days."],
  [{ id: "policy" }],
  new OpenAIEmbeddings(),
);

const rag = recipes.rag().defaults({
  adapters: {
    retriever: fromLangChainRetriever(vectorStore.asRetriever()),
    model: fromLangChainModel(new ChatOpenAI({ model: "gpt-4o-mini" })),
  },
});
```

:::

---

## 4) Diagnostics + trace

Every run returns diagnostics + trace. Strict mode turns requirement warnings into failures.

::: tabs
== TypeScript

```ts
// rag handle from above
const outcome = await rag.run(
  { input: "Summarize the refund policy." },
  { runtime: { diagnostics: "strict" } },
);

if (outcome.status === "error") {
  console.error(outcome.diagnostics);
}

console.log(outcome.trace);
```

== JavaScript

```js
// rag handle from above
const outcome = await rag.run(
  { input: "Summarize the refund policy." },
  { runtime: { diagnostics: "strict" } },
);

if (outcome.status === "error") {
  console.error(outcome.diagnostics);
}

console.log(outcome.trace);
```

:::

Related: [Runtime -> Diagnostics](/reference/runtime#diagnostics) - [Runtime -> Trace](/reference/runtime#trace)

---

## 5) Power: sub-recipes + plan

RAG is composed of two public sub-recipes. You can run them independently or inspect the plan.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";

const retrieval = recipes["rag.retrieval"]();
const synthesis = recipes["rag.synthesis"]();

const plan = recipes.rag().plan();
console.log(plan.steps.map((step) => step.id));
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";

const retrieval = recipes["rag.retrieval"]();
const synthesis = recipes["rag.synthesis"]();

const plan = recipes.rag().plan();
console.log(plan.steps.map((step) => step.id));
```

:::

---

## Implementation

- Source: [`src/recipes/rag/index.ts`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/rag/index.ts)
- Retrieval pack: [`src/recipes/rag/retrieval`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/rag/retrieval)
- Synthesis pack: [`src/recipes/rag/synthesis`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/rag/synthesis)
