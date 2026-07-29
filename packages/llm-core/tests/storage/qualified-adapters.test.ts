import { describe, expect, test } from "bun:test";
import { createAiSdkCacheStore } from "../../src/adapters/providers/ai-sdk/storage";
import {
  createLangChainCacheStore,
  createLangChainKeyValueStore,
} from "../../src/adapters/frameworks/langchain/storage";
import {
  createLlamaIndexCacheStore,
  createLlamaIndexKeyValueStore,
} from "../../src/adapters/frameworks/llamaindex/storage";
import {
  jsonStorageValue,
  type CacheRecord,
  type StorageValue,
} from "../../src/features/storage/public";
import { context } from "./helpers";

describe("qualified storage adapters", () => {
  test("maps AI SDK cache stores and default TTL", async () => {
    const values = new Map<string, CacheRecord>();
    const cache = createAiSdkCacheStore({
      store: {
        get: (key) => values.get(key),
        set: (key, entry) => void values.set(key, entry),
        delete: (key) => values.delete(key),
        getDefaultTTL: () => 1,
      },
    });
    const value = jsonStorageValue({ provider: "ai-sdk" });

    expect(cache.set(context, { key: "key", value })).toBe(true);
    expect(await cache.get(context, "key")).toEqual(value);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await cache.get(context, "key")).toBeNull();
  });

  test("maps LangChain cache and key-value stores", async () => {
    const values = new Map<string, StorageValue>();
    const native = {
      mget: (keys: string[]) => Promise.resolve(keys.map((key) => values.get(key))),
      mset: (entries: ReadonlyArray<readonly [string, StorageValue]>) => {
        entries.forEach(([key, value]) => values.set(key, value));
        return Promise.resolve();
      },
      mdelete: (keys: string[]) => {
        keys.forEach((key) => values.delete(key));
        return Promise.resolve();
      },
      yieldKeys: async function* (prefix?: string) {
        for (const key of values.keys()) {
          if (prefix === undefined || key.startsWith(prefix)) {
            yield key;
          }
        }
      },
    };
    const keyValue = createLangChainKeyValueStore(native);
    const value = jsonStorageValue({ provider: "langchain" });

    await expect(keyValue.setMany(context, [["pref:key", value]])).resolves.toBe(true);
    await expect(keyValue.getMany(context, ["pref:key"])).resolves.toEqual([value]);
    await expect(keyValue.list(context, "pref")).resolves.toEqual(["pref:key"]);
    await expect(keyValue.deleteMany(context, ["pref:key"])).resolves.toBe(true);

    const cacheValues = new Map<string, CacheRecord>();
    const cache = createLangChainCacheStore({
      ...native,
      mget: (keys: string[]) => Promise.resolve(keys.map((key) => cacheValues.get(key))),
      mset: (entries: ReadonlyArray<readonly [string, CacheRecord]>) => {
        entries.forEach(([key, entry]) => cacheValues.set(key, entry));
        return Promise.resolve();
      },
    });
    await expect(cache.set(context, { key: "cache", value })).resolves.toBe(true);
    await expect(cache.get(context, "cache")).resolves.toEqual(value);
  });

  test("maps LlamaIndex cache and document stores", async () => {
    const cacheValues = new Map<string, unknown>();
    const cache = createLlamaIndexCacheStore({
      store: {
        get: (key) => cacheValues.get(key),
        put: (key, value) => void cacheValues.set(key, value),
        delete: (key) => cacheValues.delete(key),
      },
    });
    const value = jsonStorageValue({ provider: "llamaindex" });
    expect(cache.set(context, { key: "cache", value })).toBe(true);
    expect(cache.get(context, "cache")).toEqual(value);

    const documents = new Map<string, Record<string, unknown>>();
    const keyValue = createLlamaIndexKeyValueStore({
      docs: () => Object.fromEntries(documents),
      getDocument: (key) => {
        const document = documents.get(key);
        return document ? { toJSON: () => document } : undefined;
      },
      addDocuments: (entries) => {
        entries.forEach((entry) => documents.set(String(entry.id_), entry));
      },
      deleteDocument: (key) => void documents.delete(key),
    });

    expect(keyValue.setMany(context, [["doc-1", value]])).toBe(true);
    expect(keyValue.getMany(context, ["doc-1"])).toEqual([
      jsonStorageValue({ provider: "llamaindex", id_: "doc-1" }),
    ]);
    expect(keyValue.list(context, "doc")).toEqual(["doc-1"]);
    expect(keyValue.deleteMany(context, ["doc-1"])).toBe(true);
  });
});
