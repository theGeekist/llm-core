import { describe, expect, it } from "bun:test";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { BaseEmbedding } from "@llamaindex/core/embeddings";
import { embed, embedMany, type EmbeddingModel } from "ai";
import type { AdapterEmbedder } from "#workflow";
import { mapMaybe } from "./helpers";

const toAdapterEmbedderFromLangChain = (
  embeddings: EmbeddingsInterface<number[]>,
): AdapterEmbedder => ({
  embed: (text) => mapMaybe(embeddings.embedQuery(text), (value) => value),
  embedMany: (texts) => mapMaybe(embeddings.embedDocuments(texts), (value) => value),
});

const toAdapterEmbedderFromLlama = (embedding: BaseEmbedding): AdapterEmbedder => ({
  embed: (text) => mapMaybe(embedding.getTextEmbedding(text), (value) => value),
  embedMany: (texts) => mapMaybe(embedding.getTextEmbeddings(texts), (value) => value),
});

const toAdapterEmbedderFromAiSdk = (model: EmbeddingModel<string>): AdapterEmbedder => ({
  embed: (text) => mapMaybe(embed({ model, value: text }), (result) => result.embedding),
  embedMany: (texts) =>
    mapMaybe(embedMany({ model, values: texts }), (result) => result.embeddings),
});

describe("Interop embeddings", () => {
  it("maps LangChain embeddings to AdapterEmbedder", () => {
    const embeddings = {
      embedQuery: () => Promise.resolve([0.1, 0.2]),
      embedDocuments: () => Promise.resolve([[0.1, 0.2]]),
    } as EmbeddingsInterface<number[]>;

    const adapted = toAdapterEmbedderFromLangChain(embeddings);
    expect(adapted.embed).toBeFunction();
    expect(adapted.embedMany).toBeFunction();
  });

  it("maps LlamaIndex embeddings to AdapterEmbedder", () => {
    const embedding = {
      getTextEmbedding: () => Promise.resolve([0.1, 0.2]),
      getTextEmbeddings: () => Promise.resolve([[0.1, 0.2]]),
      getQueryEmbedding: () => Promise.resolve([0.2, 0.3]),
    } as unknown as BaseEmbedding;

    const adapted = toAdapterEmbedderFromLlama(embedding);
    expect(adapted.embed).toBeFunction();
    expect(adapted.embedMany).toBeFunction();
  });

  it("maps AI SDK embedding utilities to AdapterEmbedder", () => {
    const adapted = toAdapterEmbedderFromAiSdk("test-model");
    expect(adapted.embed).toBeFunction();
    expect(adapted.embedMany).toBeFunction();
  });
});
