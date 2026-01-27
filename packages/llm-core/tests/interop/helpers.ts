export const asLangChainVectorStore = (store: unknown) =>
  store as import("@langchain/core/vectorstores").VectorStoreInterface;

export const asLlamaIndexVectorStore = (store: unknown) =>
  store as import("@llamaindex/core/vector-store").BaseVectorStore;
