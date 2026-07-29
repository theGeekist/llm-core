# Retrieval and indexing

Retrieval reads knowledge; indexing changes an index. Their ports share
portable documents but have different lifecycle and effect expectations.

```ts
import {
  textDocument,
  textRetrievalQuery,
  type Indexer,
  type Retriever,
} from "@geekist/llm-core/agent";
import { newCoreId, type InvocationContext, type InvocationId } from "@geekist/llm-core/contracts";

declare const indexer: Indexer;
declare const retriever: Retriever;

const context: InvocationContext = {
  invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01"),
};

const indexed = await indexer.index(
  {
    documents: [
      textDocument("Receipts are authoritative.", {
        id: "control/receipts",
        metadata: { source: "handbook" },
      }),
    ],
    options: { cleanup: "incremental", batchSize: 50 },
  },
  context,
);

const found = await retriever.retrieve(
  { query: textRetrievalQuery("What is authoritative?") },
  context,
);
```

An ingestion composition typically loads, transforms and splits documents,
embeds them, then invokes an `Indexer` or `VectorStore`. A query composition
builds a `RetrievalQuery`, invokes a `Retriever`, optionally reranks, and may
send the selected documents to a `ResponseSynthesizer`.

Index mutations are meaningful effects. Route orchestration that can change an
external index through the controlled effect boundary and give it an
idempotency/reconciliation strategy. Retrieval results may carry only
portable, redacted `extensions`; provider-native documents stay inside the
adapter.
