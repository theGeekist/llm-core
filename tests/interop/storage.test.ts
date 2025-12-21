import { describe, expect, it } from "bun:test";
import type { BaseStore } from "@langchain/core/stores";
import type { BaseDocumentStore } from "@llamaindex/core/storage/doc-store";
import * as AiSdk from "ai";
import type { AdapterKVStore } from "#workflow";
import { mapMaybe } from "./helpers";

const toAdapterKVFromLangChain = (store: BaseStore<string, unknown>): AdapterKVStore => ({
  mget: (keys) => store.mget(keys),
  mset: (pairs) => store.mset(pairs),
  mdelete: (keys) => store.mdelete(keys),
  list: (prefix) => collectAsyncKeys(store, prefix),
});

const toAdapterKVFromLlamaDocStore = (store: BaseDocumentStore): AdapterKVStore => ({
  mget: (keys) =>
    mapMaybe(Promise.all(keys.map((key) => store.getDocument(key, false))), (docs) =>
      docs.map((doc) => (doc ? doc.toJSON() : undefined)),
    ),
  mset: (pairs) => {
    const docs = pairs
      .filter(
        (pair): pair is [string, Record<string, unknown>] =>
          typeof pair[1] === "object" && !!pair[1],
      )
      .map(([key, value]) => {
        const doc = value as { id_?: string };
        if (!doc.id_) {
          doc.id_ = key;
        }
        return doc;
      });
    return store.addDocuments(docs as never, true);
  },
  mdelete: (keys) =>
    mapMaybe(Promise.all(keys.map((key) => store.deleteDocument(key, false))), () => undefined),
  list: () => mapMaybe(store.docs(), (docs) => Object.keys(docs)),
});

const collectAsyncKeys = async (
  store: BaseStore<string, unknown>,
  prefix?: string,
): Promise<string[]> => {
  const keys = store.yieldKeys(prefix);
  const result: string[] = [];
  for await (const key of keys) {
    result.push(String(key));
  }
  return result;
};

describe("Interop storage", () => {
  it("maps LangChain BaseStore to AdapterKVStore", () => {
    const store = {
      mget: () => Promise.resolve([undefined]),
      mset: () => Promise.resolve(),
      mdelete: () => Promise.resolve(),
      yieldKeys: async function* () {
        yield "key";
      },
    } as unknown as BaseStore<string, unknown>;

    const adapted = toAdapterKVFromLangChain(store);
    expect(adapted.mget).toBeFunction();
    expect(adapted.list).toBeFunction();
  });

  it("maps LlamaIndex DocumentStore to AdapterKVStore", () => {
    const store = {
      docs: () => Promise.resolve({}),
      addDocuments: () => Promise.resolve(),
      getDocument: () => Promise.resolve(undefined),
      deleteDocument: () => Promise.resolve(),
    } as unknown as BaseDocumentStore;

    const adapted = toAdapterKVFromLlamaDocStore(store);
    expect(adapted.mdelete).toBeFunction();
    expect(adapted.list).toBeFunction();
  });

  it("notes AI SDK has no storage abstraction", () => {
    expect("BaseStore" in AiSdk).toBe(false);
  });
});
