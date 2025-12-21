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
      yieldKeys: async function* (prefix?: string) {
        yield prefix ? `${prefix}:one` : "key";
      },
    } as unknown as BaseStore<string, unknown>;

    const adapter = fromLangChainStore(store);
    await expect(adapter.mget(["key"])).resolves.toEqual([undefined]);
    await expect(adapter.mset([["key", { ok: true }]])).resolves.toBeUndefined();
    await expect(adapter.mdelete(["key"])).resolves.toBeUndefined();
    await expect(adapter.list?.()).resolves.toEqual(["key"]);
    await expect(adapter.list?.("pref")).resolves.toEqual(["pref:one"]);
  });

  it("maps LlamaIndex document stores", async () => {
    let saved: unknown[] = [];
    const store = {
      docs: () => Promise.resolve({ "doc-1": {}, "doc-2": {} }),
      addDocuments: (docs: unknown[]) => {
        saved = docs;
        return Promise.resolve();
      },
      getDocument: (key: string) =>
        Promise.resolve({
          toJSON: () => ({ id: key, text: "doc" }),
        }),
      deleteDocument: () => Promise.resolve(),
    } as unknown as BaseDocumentStore;

    const adapter = fromLlamaIndexDocumentStore(store);
    await expect(adapter.mget(["key"])).resolves.toEqual([{ id: "key", text: "doc" }]);
    await expect(
      adapter.mset?.([
        ["doc-1", { text: "doc-1" }],
        ["doc-2", "skip" as unknown as Record<string, unknown>],
      ]),
    ).resolves.toBeUndefined();
    expect(saved).toMatchObject([{ id_: "doc-1", text: "doc-1" }]);
    await expect(adapter.mdelete?.(["doc-1"])).resolves.toBeUndefined();
    await expect(adapter.list?.()).resolves.toEqual(["doc-1", "doc-2"]);
  });
});
