import type { BaseEmbedding } from "@llamaindex/core/embeddings";
import type { AdapterEmbedder } from "../types";
import { identity, mapMaybe } from "../../maybe";

export function fromLlamaIndexEmbeddings(embedding: BaseEmbedding): AdapterEmbedder {
  function embed(text: string) {
    return mapMaybe(embedding.getTextEmbedding(text), identity);
  }

  function embedMany(texts: string[]) {
    return mapMaybe(embedding.getTextEmbeddings(texts), identity);
  }

  return { embed, embedMany };
}
