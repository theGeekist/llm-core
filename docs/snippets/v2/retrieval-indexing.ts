import { newCoreId, type InvocationContext, type InvocationId } from "@geekist/llm-core/contracts";
import type { Indexer } from "@geekist/llm-core/indexing";
import { textDocument, textRetrievalQuery, type Retriever } from "@geekist/llm-core/retrieval";

declare const indexer: Indexer;
declare const retriever: Retriever;

const context: InvocationContext = {
  invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01"),
};

await indexer.index({
  request: {
    documents: [
      textDocument("Receipts are authoritative.", {
        id: "control/receipts",
        metadata: { source: "handbook" },
      }),
    ],
    options: { cleanup: "incremental", batchSize: 50 },
  },
  context,
});

await retriever.retrieve({
  request: { query: textRetrievalQuery("What is authoritative?") },
  context,
});
