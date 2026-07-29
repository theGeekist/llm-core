import { embed, embedMany, type EmbeddingModel } from "ai";
import type { AdapterRequest, Embedder } from "../types";
import { maybeMap } from "#shared/maybe";
import {
  reportDiagnostics,
  validateEmbedderBatchInput,
  validateEmbedderInput,
} from "../input-validation";

type EmbedResult = Awaited<ReturnType<typeof embed>>;
type EmbedManyResult = Awaited<ReturnType<typeof embedMany>>;

function pickEmbedding(result: EmbedResult) {
  return result.embedding;
}

function pickEmbeddings(result: EmbedManyResult) {
  return result.embeddings;
}

export function fromAiSdkEmbeddings(model: EmbeddingModel): Embedder {
  function embedOne({ text, context }: AdapterRequest<{ text: string }>) {
    const diagnostics = validateEmbedderInput(text);
    if (reportDiagnostics(context, diagnostics)) {
      return [];
    }
    return maybeMap(pickEmbedding, embed({ model, value: text }));
  }

  function embedManyTexts({ texts, context }: AdapterRequest<{ texts: string[] }>) {
    const diagnostics = validateEmbedderBatchInput(texts);
    if (reportDiagnostics(context, diagnostics)) {
      return [];
    }
    return maybeMap(pickEmbeddings, embedMany({ model, values: texts }));
  }

  return { embed: embedOne, embedMany: embedManyTexts };
}
