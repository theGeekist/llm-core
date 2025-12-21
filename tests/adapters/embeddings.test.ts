import { describe, expect, it, mock } from "bun:test";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { BaseEmbedding } from "@llamaindex/core/embeddings";
import { fromLangChainEmbeddings, fromLlamaIndexEmbeddings } from "#adapters";

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

  it("exposes AI SDK embedding adapters", async () => {
    mock.module("ai", () => ({
      embed: ({ value }: { value: string }) =>
        value === "async"
          ? Promise.resolve({ embedding: [value.length] })
          : { embedding: [value.length] },
      embedMany: ({ values }: { values: string[] }) =>
        values.includes("async")
          ? Promise.resolve({ embeddings: values.map((entry) => [entry.length]) })
          : { embeddings: values.map((entry) => [entry.length]) },
    }));
    const { fromAiSdkEmbeddings } = await import("../../src/adapters/ai-sdk/embeddings.ts");
    const adapter = fromAiSdkEmbeddings("test-model" as never);
    expect(adapter.embed).toBeFunction();
    expect(adapter.embedMany).toBeFunction();
    expect(adapter.embed("hi")).toEqual([2]);
    await expect(Promise.resolve(adapter.embed("async"))).resolves.toEqual([5]);
    expect(adapter.embedMany?.(["a", "abcd"])).toEqual([[1], [4]]);
    await expect(Promise.resolve(adapter.embedMany?.(["a", "async"]))).resolves.toEqual([[1], [5]]);
  });
});
