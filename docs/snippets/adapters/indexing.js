import { fromLangChainIndexing } from "#adapters";
// #region docs
import { Embeddings } from "@langchain/core/embeddings";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

class DummyEmbeddings extends Embeddings {
  constructor() {
    super({});
  }

  /** @param {string[]} documents */
  async embedDocuments(documents) {
    return documents.map(() => [0, 1, 0]);
  }

  /** @param {string} _text */
  async embedQuery(_text) {
    return [0, 1, 0];
  }
}

const recordManager = {
  createSchema: async () => {},
  getTime: async () => Date.now(),
  /**
   * @param {string[]} _keys
   * @param {import("@langchain/core/indexing").UpdateOptions} _options
   */
  update: async (_keys, _options) => {},
  /** @param {string[]} keys */
  exists: async (keys) => keys.map(() => false),
  /** @param {import("@langchain/core/indexing").ListKeyOptions} _options */
  listKeys: async (_options) => [],
  /** @param {string[]} _keys */
  deleteKeys: async (_keys) => {},
};
const vectorStore = new MemoryVectorStore(new DummyEmbeddings());
// Note: Requires a raw LangChain vector store instance
const indexing = fromLangChainIndexing(recordManager, vectorStore);
// #endregion docs

void indexing;
