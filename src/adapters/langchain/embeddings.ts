import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { AdapterCallContext, Embedder } from "../types";
import { identity, maybeMap } from "../../shared/maybe";
import {
  reportDiagnostics,
  validateEmbedderBatchInput,
  validateEmbedderInput,
} from "../input-validation";

export function fromLangChainEmbeddings(embeddings: EmbeddingsInterface<number[]>): Embedder {
  function embed(text: string, context?: AdapterCallContext) {
    const diagnostics = validateEmbedderInput(text);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return maybeMap(identity, embeddings.embedQuery(text));
  }

  function embedMany(texts: string[], context?: AdapterCallContext) {
    const diagnostics = validateEmbedderBatchInput(texts);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return maybeMap(identity, embeddings.embedDocuments(texts));
  }

  return { embed, embedMany };
}
