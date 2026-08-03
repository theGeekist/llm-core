import type { RerankingModelV3 } from "@ai-sdk/provider";
import { embed, embedMany, type EmbeddingModel } from "ai";
import { maybeMap } from "#shared/maybe";
import type { Document, Embedder, Reranker } from "../../features/retrieval/public";
import { documentText, retrievalQueryText } from "../../features/retrieval/public";

const requireText = (value: string, operation: string) => {
  if (value.trim().length === 0) {
    throw new TypeError(`${operation} requires non-blank text.`);
  }
};

export function createAiSdkEmbedder(model: EmbeddingModel): Embedder {
  return {
    embed: ({ request: { text } }) => {
      requireText(text, "Embedding");
      return maybeMap((result) => result.embedding, embed({ model, value: text }));
    },
    embedMany: ({ request: { texts } }) => {
      if (texts.length === 0) throw new TypeError("Batch embedding requires text.");
      texts.forEach((text) => requireText(text, "Batch embedding"));
      return maybeMap((result) => result.embeddings, embedMany({ model, values: texts }));
    },
  };
}

type RerankResult = Awaited<ReturnType<RerankingModelV3["doRerank"]>>;

const mapRanking = (documents: Document[], ranking: RerankResult["ranking"]) =>
  ranking.reduce<Document[]>((ranked, entry) => {
    const document = documents[entry.index];
    if (document) ranked.push({ ...document, score: entry.relevanceScore });
    return ranked;
  }, []);

export function createAiSdkReranker(model: RerankingModelV3): Reranker {
  return {
    rerank: ({ request: { query, documents } }) => {
      if (documents.length === 0) throw new TypeError("Reranking requires documents.");
      const queryText = retrievalQueryText(query);
      requireText(queryText, "Reranking");
      return maybeMap(
        (result) => mapRanking(documents, result.ranking),
        Promise.resolve(
          model.doRerank({
            query: queryText,
            documents: { type: "text", values: documents.map(documentText) },
          }),
        ),
      );
    },
  };
}
