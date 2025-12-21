import { describe, expect, it } from "bun:test";
import type { BaseStore } from "@langchain/core/stores";
import type { BaseDocumentStore } from "@llamaindex/core/storage/doc-store";
import { fromLangChainStore, fromLlamaIndexDocumentStore } from "#adapters";

describe("Adapter storage", () => {
  it("maps LangChain stores", async () => {
    const store = {
      mget: () => Promise.resolve([undefined]),
      mset: () => Promise.resolve(),
      mdelete: () => Promise.resolve(),
      yieldKeys: async function* () {
        yield "key";
      },
    } as unknown as BaseStore<string, unknown>;

    const adapter = fromLangChainStore(store);
    await expect(adapter.mget(["key"])).resolves.toEqual([undefined]);
    await expect(adapter.list?.()).resolves.toEqual(["key"]);
  });

  it("maps LlamaIndex document stores", async () => {
    const store = {
      docs: () => Promise.resolve({}),
      addDocuments: () => Promise.resolve(),
      getDocument: () => Promise.resolve(undefined),
      deleteDocument: () => Promise.resolve(),
    } as unknown as BaseDocumentStore;

    const adapter = fromLlamaIndexDocumentStore(store);
    await expect(adapter.mget(["key"])).resolves.toEqual([undefined]);
    await expect(adapter.list?.()).resolves.toEqual([]);
  });
});
