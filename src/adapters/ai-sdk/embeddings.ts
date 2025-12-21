import { embed, embedMany, type EmbeddingModel } from "ai";
import type { AdapterEmbedder } from "../types";
import { mapMaybe } from "../maybe";

type EmbedResult = Awaited<ReturnType<typeof embed>>;
type EmbedManyResult = Awaited<ReturnType<typeof embedMany>>;

function pickEmbedding(result: EmbedResult) {
  return result.embedding;
}

function pickEmbeddings(result: EmbedManyResult) {
  return result.embeddings;
}

export function fromAiSdkEmbeddings(model: EmbeddingModel<string>): AdapterEmbedder {
  function embedOne(text: string) {
    return mapMaybe(embed({ model, value: text }), pickEmbedding);
  }

  function embedManyTexts(texts: string[]) {
    return mapMaybe(embedMany({ model, values: texts }), pickEmbeddings);
  }

  return { embed: embedOne, embedMany: embedManyTexts };
}
