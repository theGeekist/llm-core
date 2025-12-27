import { describe, expect, it } from "bun:test";
import type { RecordManagerInterface } from "@langchain/core/indexing";
import type { VectorStore as LangChainVectorStore } from "@langchain/core/vectorstores";
import { fromLangChainIndexing } from "#adapters";
import { captureDiagnostics } from "./helpers";

const createRecordManager = (): RecordManagerInterface => ({
  createSchema: async () => {},
  getTime: async () => 0,
  update: async (_keys: string[], _options: { timeAtLeast?: number }) => {
    void _keys;
    void _options;
  },
  exists: async (keys: string[]) => keys.map(() => false),
  listKeys: async (_options: { before?: number }) => {
    void _options;
    return [];
  },
  deleteKeys: async (_keys: string[]) => {
    void _keys;
  },
});

const createVectorStore = () => {
  let added = 0;
  const store = {
    addDocuments: async (docs: Array<{ pageContent: string }>) => {
      added = docs.length;
    },
    delete: async () => {},
  } as unknown as LangChainVectorStore;
  return { store, added: () => added };
};

describe("Adapter LangChain indexing", () => {
  it("indexes documents via the LangChain index API", async () => {
    const recordManager = createRecordManager();
    const vectorStore = createVectorStore();
    const adapter = fromLangChainIndexing(recordManager, vectorStore.store);

    const result = await adapter.index({ documents: [{ text: "doc" }] });
    expect(result.added).toBe(1);
    expect(vectorStore.added()).toBe(1);
  });

  it("reports diagnostics when indexing input is missing", async () => {
    const recordManager = createRecordManager();
    const vectorStore = createVectorStore();
    const adapter = fromLangChainIndexing(recordManager, vectorStore.store);
    const { context, diagnostics } = captureDiagnostics();

    const result = await adapter.index(undefined as unknown as { documents: [] }, context);
    expect(result.added).toBe(0);
    expect(diagnostics.map((entry) => entry.message)).toContain("indexing_input_missing");
  });

  it("loads documents when a loader is provided", async () => {
    const recordManager: RecordManagerInterface = {
      ...createRecordManager(),
      createSchema: async () => undefined,
    };
    const vectorStore = createVectorStore();
    const adapter = fromLangChainIndexing(recordManager, vectorStore.store);

    const result = await adapter.index({
      loader: { load: async () => [{ text: "doc" }] },
    });

    expect(result.added).toBe(1);
    expect(vectorStore.added()).toBe(1);
  });

  it("indexes even when the record manager schema is missing", async () => {
    const recordManager: RecordManagerInterface = {
      ...createRecordManager(),
      createSchema: async () => undefined,
    };
    const vectorStore = createVectorStore();
    const adapter = fromLangChainIndexing(recordManager, vectorStore.store);

    const result = await adapter.index({
      loader: { load: async () => [{ text: "doc" }] },
    });

    expect(result.added).toBe(1);
    expect(vectorStore.added()).toBe(1);
  });
});
