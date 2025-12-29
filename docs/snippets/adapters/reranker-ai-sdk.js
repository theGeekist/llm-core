import { fromAiSdkReranker } from "#adapters";

/** @type {import("@ai-sdk/provider").RerankingModelV3} */
const mockRerankerModel = {
  specificationVersion: "v3",
  provider: "mock",
  modelId: "rerank-mini",
  doRerank: async () => ({
    ranking: [{ index: 0, relevanceScore: 1 }],
  }),
};

const reranker = fromAiSdkReranker(mockRerankerModel);

// Mocks
const userQuery = "query";
/** @type {import("@geekist/llm-core/adapters").Document[]} */
const retrievedDocs = [];

// In a custom recipe step:
const refinedDocs = await reranker.rerank(userQuery, retrievedDocs);

void refinedDocs;
