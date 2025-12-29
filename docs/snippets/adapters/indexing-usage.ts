// #region docs
import { fromLangChainIndexing } from "#adapters";
import type { Indexing, IndexingResult } from "#adapters";
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
const myDocs = [{ id: "doc-1", text: "Hello" }];

// 1. Define the Indexing logic
const indexing: Indexing = fromLangChainIndexing(recordManager, langChainVectorStore);

// 2. Run the sync job
const result: IndexingResult = await indexing.index({
  documents: myDocs,
  options: {
    cleanup: "full",
    sourceIdKey: "source",
  },
});
// #endregion docs
void result;
