import type { BaseEmbedding } from "@llamaindex/core/embeddings";
import type { AdapterCallContext, Embedder } from "../types";
import { identity, mapMaybe } from "../../maybe";
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
    return mapMaybe(embedding.getTextEmbedding(text), identity);
  }

  function embedMany(texts: string[], context?: AdapterCallContext) {
    const diagnostics = validateEmbedderBatchInput(texts);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return mapMaybe(embedding.getTextEmbeddings(texts), identity);
  }

  return { embed, embedMany };
}
