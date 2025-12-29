// #region docs
import { fromLangChainIndexing } from "#adapters";
import { Embeddings } from "@langchain/core/embeddings";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

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

const langChainVectorStore = new MemoryVectorStore(new DummyEmbeddings());
const myDocs = [{ id: "doc-1", text: "Hello" }];

// 1. Define the Indexing logic
const indexing = fromLangChainIndexing(recordManager, langChainVectorStore);

// 2. Run the sync job
const result = await indexing.index({
  documents: myDocs,
  options: {
    cleanup: "full",
    sourceIdKey: "source",
  },
});
// #endregion docs
void result;
