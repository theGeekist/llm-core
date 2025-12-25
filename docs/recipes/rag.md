# RAG Recipe (Deep Dive)

The **Retrieval Augmented Generation (RAG)** recipe is the standard way to "chat with your data".
It connects a **Retriever** (your database) to a **Model** (your brain).

## How it works

```mermaid
flowchart LR
    User([User Query]) --> Retrieve[Retrieve Docs]
    Retrieve --> Rerank[Rerank (Optional)]
    Rerank --> Context[Build Context]
    Context --> Model[LLM Generate]
    Model --> Answer([Final Answer])

    style Retrieve fill:#cdf,stroke:#333
    style Model fill:#fdc,stroke:#333
```

## Input & Output

This recipe expects a simple input object and returns a rich set of artifacts.

```ts
const input = {
  input: "How do I reset my password?",
  topK: 5, // Optional: how many docs to retrieve
};
```

**What you get back (Artefact):**

- `answer.text`: The final response.
- `retrieval.set`: The raw documents found.
- `citations`: Example `[1]`, `[2]` references used in the answer.

## Minimal Example

Connect a vector store and a model.

::: tabs
== TypeScript

```ts
const workflow = Workflow.recipe("rag")
  .use(Adapter.model("openai.model", ...))
  .use(Adapter.retriever("my-vector-store", {
     retrieve: async ({ query }) => {
       // Call your DB here (Postgres, Pinecone, etc)
       return { documents: [{ text: "..." }] };
     }
  }));
```

:::

## Advanced: Adding Reranking

Retrieval is often messy. A **Reranker** sorts the results by relevance before sending them to the LLM.
Just add a `reranker` adapter!

::: tabs
== TypeScript

```diff
  .use(Adapter.retriever("my-vector-store", ...))
+ .use(Adapter.reranker("cohere", ...))
```

:::

The recipe automatically detects the reranker and inserts the `Rerank` stage into the pipeline.

## Why use this Recipe?

1.  **Citations work**: It automatically handles the prompt engineering to get the LLM to cite sources.
2.  **Observability**: You see exactly what document was retrieved and why.
3.  **Swappable**: Switch from OpenAI to Anthropic, or Pinecone to Postgres, without breaking the flow.
