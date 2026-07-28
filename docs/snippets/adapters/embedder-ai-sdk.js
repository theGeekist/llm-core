// #region docs
import { fromAiSdkEmbeddings } from "#adapters";
import { openai } from "@ai-sdk/openai";

// Create an embedder capable of batching
const embedder = fromAiSdkEmbeddings(openai.embedding("text-embedding-3-small"));

// Embed a batch of text (fallback if embedMany is not available)
const vectors = embedder.embedMany
  ? await embedder.embedMany({ texts: ["Hello", "World"] })
  : [await embedder.embed({ text: "Hello" }), await embedder.embed({ text: "World" })];
// #endregion docs
void vectors;
