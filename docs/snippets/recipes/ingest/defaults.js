// #region docs
import { recipes } from "#recipes";
// #endregion docs

/** @type {import("@geekist/llm-core/adapters").DocumentLoader} */
const loader = {
  load: async () => [{ id: "doc-1", text: "Hello" }],
};

/** @param {string} text */
const splitText = async (text) => [text];

/** @type {import("@geekist/llm-core/adapters").TextSplitter} */
const textSplitter = {
  split: splitText,
};

/** @type {import("@geekist/llm-core/adapters").Embedder} */
const embedder = {
  embed: async () => [0, 1, 0],
};

/** @type {import("@geekist/llm-core/adapters").VectorStore} */
const vectorStore = {
  upsert: async () => ({ ids: ["chunk-1"] }),
  delete: async () => true,
};

// Reuse loader/textSplitter/embedder/vectorStore from the quick start.
// #region docs
// Reuse loader/textSplitter/embedder/vectorStore from the quick start.
const ingest = recipes.ingest().configure({
  defaults: {
    adapters: { loader, textSplitter, embedder, vectorStore },
  },
});
// #endregion docs

void ingest;
