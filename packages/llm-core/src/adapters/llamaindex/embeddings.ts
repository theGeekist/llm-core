import type { BaseEmbedding } from "@llamaindex/core/embeddings";
import type { AdapterRequest, Embedder } from "../types";
import {
  reportDiagnostics,
  validateEmbedderBatchInput,
  validateEmbedderInput,
} from "../input-validation";

export function fromLlamaIndexEmbeddings(embedding: BaseEmbedding): Embedder {
  function embed({ text, context }: AdapterRequest<{ text: string }>) {
    const diagnostics = validateEmbedderInput(text);
    if (reportDiagnostics(context, diagnostics)) {
      return [];
    }
    return embedding.getTextEmbedding(text);
  }

  function embedMany({ texts, context }: AdapterRequest<{ texts: string[] }>) {
    const diagnostics = validateEmbedderBatchInput(texts);
    if (reportDiagnostics(context, diagnostics)) {
      return [];
    }
    return embedding.getTextEmbeddings(texts);
  }

  return { embed, embedMany };
}
