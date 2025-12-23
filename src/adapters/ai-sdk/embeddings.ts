import { embed, embedMany, type EmbeddingModel } from "ai";
import type { AdapterCallContext, Embedder } from "../types";
import { mapMaybe } from "../../maybe";
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

export function fromAiSdkEmbeddings(model: EmbeddingModel<string>): Embedder {
  function embedOne(text: string, context?: AdapterCallContext) {
    const diagnostics = validateEmbedderInput(text);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return mapMaybe(embed({ model, value: text }), pickEmbedding);
  }

  function embedManyTexts(texts: string[], context?: AdapterCallContext) {
    const diagnostics = validateEmbedderBatchInput(texts);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return mapMaybe(embedMany({ model, values: texts }), pickEmbeddings);
  }

  return { embed: embedOne, embedMany: embedManyTexts };
}
