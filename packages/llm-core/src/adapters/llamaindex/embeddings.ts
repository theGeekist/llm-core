import type { BaseEmbedding } from "@llamaindex/core/embeddings";
import type { AdapterCallContext, Embedder } from "../types";
import {
  reportDiagnostics,
  validateEmbedderBatchInput,
  validateEmbedderInput,
} from "../input-validation";

export function fromLlamaIndexEmbeddings(embedding: BaseEmbedding): Embedder {
  function embed(text: string, context?: AdapterCallContext) {
    const diagnostics = validateEmbedderInput(text);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return embedding.getTextEmbedding(text);
  }

  function embedMany(texts: string[], context?: AdapterCallContext) {
    const diagnostics = validateEmbedderBatchInput(texts);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return embedding.getTextEmbeddings(texts);
  }

  return { embed, embedMany };
}
