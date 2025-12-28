# Tutorial: Chatting with Data (RAG)

Retrieval-Augmented Generation (RAG) is how you give your LLM a "Long Term Memory".
Instead of relying on what the model learned during training, you provide it with _your_ specific documents right when it needs them.

Building a RAG pipeline from scratch is hard. You have to handle embedding, searching, reranking, and prompt injecting.
The `rag` recipe handles this orchestration for you.

## 1. The Strategy

A robust RAG pipeline is a sequence of **Refinements**:

```text
graph TD
    A --> B
```

The Recipe manages this flow. You just provide the components (the Adapters).

## 2. "I have my data in Pinecone/Postgres" (The Retriever)

The Recipe doesn't care where your data lives. It just asks: _"Can you give me a `Retriever`?"_

A **Retriever Interface** is simple: `Query -> Documents`.
You can wrap _any_ database client.

```ts
// Your custom logic
const myDatabaseRetriever = {
  retrieve: async ({ query }) => {
    // 1. You call your DB
    const results = await pinecone.search(query);
    // 2. You return standard Documents
    return {
      documents: results.map((r) => ({ text: r.content })),
    };
  },
};

// Wire it into the recipe
const rag = recipes.rag().defaults({
  adapters: { retriever: myDatabaseRetriever },
});
```

> [!TIP] > **Don't want to write manual wrappers?**
> We have ready-made adapters for **LangChain** and **LlamaIndex**. If you already have a `VectorStore` set up there, just import it!
> See [Retrieval Adapters](/reference/adapters/retrieval).

## 3. "The results are noisy" (Reranking)

Vector search is fuzzy. It often returns irrelevant documents that look mathematically similar.
To fix this, you don't need to change your database. You just **add a Reranker**.

A Reranker is a specialized model (like Cohere) that grades documents.

```ts
import { fromAiSdkReranker } from "@geekist/llm-core/adapters";
import { cohere } from "@ai-sdk/cohere";

const ragWithRerank = recipes.rag().defaults({
  adapters: {
    retriever: myDatabase,
    // Just plug it in. The recipe will detect it and add the step.
    reranker: fromAiSdkReranker(cohere.reranker("rerank-english-v3.0")),
  },
});
```

## 4. Source Code

See how the `RAG` recipe composes a `RetrievalPack` and a `SynthesisPack` to create this pipeline.

<<< @/../src/recipes/rag/index.ts
