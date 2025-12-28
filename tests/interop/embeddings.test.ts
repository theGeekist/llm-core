import { describe, expect, it } from "bun:test";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { BaseEmbedding } from "@llamaindex/core/embeddings";
import { embed, embedMany, type EmbeddingModel } from "ai";
import type { Embedder } from "#workflow";
import { maybeMap, identity } from "../../src/maybe";

const toEmbedderFromLangChain = (embeddings: EmbeddingsInterface<number[]>): Embedder => ({
  embed: (text) => maybeMap(identity, embeddings.embedQuery(text)),
  embedMany: (texts) => maybeMap(identity, embeddings.embedDocuments(texts)),
});

const toEmbedderFromLlama = (embedding: BaseEmbedding): Embedder => ({
  embed: (text) => maybeMap(identity, embedding.getTextEmbedding(text)),
  embedMany: (texts) => maybeMap(identity, embedding.getTextEmbeddings(texts)),
});

const toEmbedderFromAiSdk = (model: EmbeddingModel<string>): Embedder => ({
  embed: (text) => maybeMap((result) => result.embedding, embed({ model, value: text })),
  embedMany: (texts) =>
    maybeMap((result) => result.embeddings, embedMany({ model, values: texts })),
});

describe("Interop embeddings", () => {
  it("maps LangChain embeddings to Embedder", () => {
    const embeddings = {
      embedQuery: () => Promise.resolve([0.1, 0.2]),
      embedDocuments: () => Promise.resolve([[0.1, 0.2]]),
    } as EmbeddingsInterface<number[]>;

    const adapted = toEmbedderFromLangChain(embeddings);
    expect(adapted.embed).toBeFunction();
    expect(adapted.embedMany).toBeFunction();
  });

  it("maps LlamaIndex embeddings to Embedder", () => {
    const embedding = {
      getTextEmbedding: () => Promise.resolve([0.1, 0.2]),
      getTextEmbeddings: () => Promise.resolve([[0.1, 0.2]]),
      getQueryEmbedding: () => Promise.resolve([0.2, 0.3]),
    } as unknown as BaseEmbedding;

    const adapted = toEmbedderFromLlama(embedding);
    expect(adapted.embed).toBeFunction();
    expect(adapted.embedMany).toBeFunction();
  });

  it("maps AI SDK embedding utilities to Embedder", () => {
    const adapted = toEmbedderFromAiSdk("test-model");
    expect(adapted.embed).toBeFunction();
    expect(adapted.embedMany).toBeFunction();
  });
});
