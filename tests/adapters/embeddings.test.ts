import { describe, expect, it } from "bun:test";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { BaseEmbedding } from "@llamaindex/core/embeddings";
import { fromAiSdkEmbeddings, fromLangChainEmbeddings, fromLlamaIndexEmbeddings } from "#adapters";

describe("Adapter embeddings", () => {
  it("maps LangChain embeddings with sync returns", () => {
    const embeddings = {
      embedQuery: () => [0.1, 0.2],
      embedDocuments: () => [[0.1, 0.2]],
    } as unknown as EmbeddingsInterface<number[]>;

    const adapter = fromLangChainEmbeddings(embeddings);
    expect(adapter.embed("hi")).toEqual([0.1, 0.2]);
    expect(adapter.embedMany?.(["hi"])).toEqual([[0.1, 0.2]]);
  });

  it("maps LangChain embeddings with async returns", async () => {
    const embeddings = {
      embedQuery: () => Promise.resolve([0.3, 0.4]),
      embedDocuments: () => Promise.resolve([[0.3, 0.4]]),
    } as EmbeddingsInterface<number[]>;

    const adapter = fromLangChainEmbeddings(embeddings);
    await expect(adapter.embed("hi")).resolves.toEqual([0.3, 0.4]);
    await expect(adapter.embedMany?.(["hi"])).resolves.toEqual([[0.3, 0.4]]);
  });

  it("maps LlamaIndex embeddings with sync and async returns", async () => {
    const embedding = {
      getTextEmbedding: () => [0.5, 0.6],
      getTextEmbeddings: () => Promise.resolve([[0.5, 0.6]]),
    } as unknown as BaseEmbedding;

    const adapter = fromLlamaIndexEmbeddings(embedding);
    expect(adapter.embed("hi")).toEqual([0.5, 0.6]);
    await expect(adapter.embedMany?.(["hi"])).resolves.toEqual([[0.5, 0.6]]);
  });

  it("exposes AI SDK embedding adapters", () => {
    const adapter = fromAiSdkEmbeddings("test-model");
    expect(adapter.embed).toBeFunction();
    expect(adapter.embedMany).toBeFunction();
  });
});
