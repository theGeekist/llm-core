import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { AdapterRequest, Embedder } from "../types";
import {
  reportDiagnostics,
  validateEmbedderBatchInput,
  validateEmbedderInput,
} from "../input-validation";

export function fromLangChainEmbeddings(embeddings: EmbeddingsInterface<number[]>): Embedder {
  function embed({ text, context }: AdapterRequest<{ text: string }>) {
    const diagnostics = validateEmbedderInput(text);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return embeddings.embedQuery(text);
  }

  function embedMany({ texts, context }: AdapterRequest<{ texts: string[] }>) {
    const diagnostics = validateEmbedderBatchInput(texts);
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return [];
    }
    return embeddings.embedDocuments(texts);
  }

  return { embed, embedMany };
}
