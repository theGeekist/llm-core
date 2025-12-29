// #region docs
import { fromLangChainIndexing } from "#adapters";
import type { Indexing } from "#adapters";
import type { RecordManagerInterface } from "@langchain/core/indexing";
import type { VectorStore } from "@langchain/core/vectorstores";

const recordManager: RecordManagerInterface = {
  createSchema: async () => {},
  getTime: async () => Date.now(),
  update: async () => {},
  exists: async (keys) => keys.map(() => false),
  listKeys: async () => [],
  deleteKeys: async () => {},
};
const langChainVectorStore = {} as unknown as VectorStore;

// Note: Requires a raw LangChain vector store instance
const indexing: Indexing = fromLangChainIndexing(recordManager, langChainVectorStore);
// #endregion docs

void indexing;
