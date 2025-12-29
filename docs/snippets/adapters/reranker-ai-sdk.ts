// #region docs
import { fromAiSdkReranker } from "#adapters";
import type { Reranker, Document } from "#adapters";
import type { RerankingModelV3 } from "@ai-sdk/provider";

const mockRerankerModel: RerankingModelV3 = {
  specificationVersion: "v3",
  provider: "mock",
  modelId: "rerank-mini",
  doRerank: async () => ({
    ranking: [{ index: 0, relevanceScore: 1 }],
  }),
};

const reranker: Reranker = fromAiSdkReranker(mockRerankerModel);

// Mocks
const userQuery = "query";
const retrievedDocs: Document[] = [];

// In a custom recipe step:
const refinedDocs: Document[] = await reranker.rerank(userQuery, retrievedDocs);
// #endregion docs

void refinedDocs;
