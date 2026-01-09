import { describe, expect, it } from "bun:test";
import type { BaseStore } from "@langchain/core/stores";
import type { BaseDocumentStore } from "@llamaindex/core/storage/doc-store";
import * as AiSdk from "ai";
import type { KVStore } from "#workflow";
import { toNull } from "../../src/shared/fp";
import { maybeMap } from "../../src/shared/maybe";

const toAdapterKVFromLangChain = (store: BaseStore<string, unknown>): KVStore => ({
  mget: (keys) => store.mget(keys),
  mset: (pairs) => maybeMap(toNull, store.mset(pairs)),
  mdelete: (keys) => maybeMap(toNull, store.mdelete(keys)),
  list: (prefix) => collectAsyncKeys(store, prefix),
});

const toAdapterKVFromLlamaDocStore = (store: BaseDocumentStore): KVStore => ({
  mget: (keys) =>
    maybeMap(
      (docs) => docs.map((doc) => (doc ? doc.toJSON() : undefined)),
      Promise.all(keys.map((key) => store.getDocument(key, false))),
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
    return maybeMap(toNull, store.addDocuments(docs as never, true));
  },
  mdelete: (keys) =>
    maybeMap(toNull, Promise.all(keys.map((key) => store.deleteDocument(key, false)))),
  list: () => maybeMap((docs) => Object.keys(docs), store.docs()),
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
  it("maps LangChain BaseStore toKVStore", () => {
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

  it("maps LlamaIndex DocumentStore toKVStore", () => {
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
