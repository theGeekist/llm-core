// #region docs
import { fromAiSdkEmbeddings } from "#adapters";
import type { Embedder } from "#adapters";
import { openai } from "@ai-sdk/openai";

// Create an embedder capable of batching
const embedder: Embedder = fromAiSdkEmbeddings(openai.embedding("text-embedding-3-small"));

// Embed a batch of text (fallback if embedMany is not available)
const vectors: number[][] = embedder.embedMany
  ? await embedder.embedMany(["Hello", "World"])
  : [await embedder.embed("Hello"), await embedder.embed("World")];
// #endregion docs
void vectors;
