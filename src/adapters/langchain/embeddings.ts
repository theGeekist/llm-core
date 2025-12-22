import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { AdapterEmbedder } from "../types";
import { identity, mapMaybe } from "../../maybe";

export function fromLangChainEmbeddings(
  embeddings: EmbeddingsInterface<number[]>,
): AdapterEmbedder {
  function embed(text: string) {
    return mapMaybe(embeddings.embedQuery(text), identity);
  }

  function embedMany(texts: string[]) {
    return mapMaybe(embeddings.embedDocuments(texts), identity);
  }

  return { embed, embedMany };
}
