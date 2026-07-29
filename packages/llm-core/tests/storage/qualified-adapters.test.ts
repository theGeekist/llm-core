import { describe, expect, test } from "bun:test";
import { KVDocumentStore } from "@llamaindex/core/storage/doc-store";
import { SimpleKVStore } from "@llamaindex/core/storage/kv-store";
import { createHostBackedCacheStore } from "../../src/adapters/providers/ai-sdk/storage";
import {
  createLangChainCacheStore,
  createLangChainKeyValueStore,
} from "../../src/adapters/frameworks/langchain/storage";
import {
  createLlamaIndexCacheStore,
  createLlamaIndexDocumentKeyValueStore,
  createLlamaIndexKeyValueStore,
} from "../../src/adapters/frameworks/llamaindex/storage";
import {
  jsonStorageValue,
  resourceStorageValue,
  type CacheRecord,
  type StorageValue,
} from "../../src/features/storage/public";
import { context, resource } from "./helpers";

describe("qualified storage adapters", () => {
  test("maps a truthful host cache contract and default TTL", async () => {
    const values = new Map<string, CacheRecord>();
    const cache = createHostBackedCacheStore({
      store: {
        get: (key) => values.get(key),
        set: (key, entry) => void values.set(key, entry),
        delete: (key) => values.delete(key),
        getDefaultTTL: () => 1_000,
      },
    });
    const value = jsonStorageValue({ implementation: "host" });

    expect(cache.set(context, { key: "key", value })).toBe(true);
    expect(await cache.get(context, "key")).toEqual(value);
    expect(values.get("key")?.expiresAt).toBeDefined();
  });

  test("rejects invalid host default TTL runtime values before calling set", () => {
    let writes = 0;
    for (const defaultTtl of [
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "1000",
      0.5,
      -1,
      Number.MAX_SAFE_INTEGER,
    ]) {
      const cache = createHostBackedCacheStore({
        store: {
          get: () => undefined,
          set: () => {
            writes += 1;
          },
          delete: () => false,
          getDefaultTTL: () => defaultTtl,
        },
      });
      expect(() =>
        cache.set(context, { key: "key", value: jsonStorageValue({ safe: true }) }),
      ).toThrow();

      const configured = createHostBackedCacheStore({
        defaultTtlMs: defaultTtl,
        store: {
          get: () => undefined,
          set: () => {
            writes += 1;
          },
          delete: () => false,
          getDefaultTTL: () => 100,
        },
      });
      expect(() =>
        configured.set(context, { key: "configured", value: jsonStorageValue({ safe: true }) }),
      ).toThrow();
    }
    expect(writes).toBe(0);
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

  test("round-trips exact values through installed LlamaIndex stores", async () => {
    const cacheValues = new SimpleKVStore();
    const cache = createLlamaIndexCacheStore({
      store: cacheValues,
      collection: "llm-core-cache",
    });
    const value = jsonStorageValue({ provider: "llamaindex" });
    await expect(cache.set(context, { key: "cache", value })).resolves.toBe(true);
    await expect(cache.get(context, "cache")).resolves.toEqual(value);

    const nativeValues = new SimpleKVStore();
    const keyValue = createLlamaIndexKeyValueStore({
      store: nativeValues,
      collection: "llm-core-values",
    });
    const scalarValue = jsonStorageValue("scalar");
    const referencedValue = resourceStorageValue(resource);
    const values = [value, scalarValue, referencedValue];
    await expect(
      keyValue.setMany(context, [
        ["doc-1", value],
        ["doc-2", scalarValue],
        ["doc-3", referencedValue],
      ]),
    ).resolves.toBe(true);
    await expect(keyValue.getMany(context, ["doc-1", "doc-2", "doc-3"])).resolves.toEqual(values);
    await expect(keyValue.list(context, "doc")).resolves.toEqual(["doc-1", "doc-2", "doc-3"]);
    await nativeValues.put(
      "foreign",
      { credential: "raw", signedUrl: "https://storage.invalid/file?token=secret" },
      "llm-core-values",
    );
    await expect(keyValue.getMany(context, ["foreign"])).resolves.toEqual([null]);
    await expect(keyValue.list(context)).resolves.not.toContain("foreign");
    expect(() =>
      keyValue.setMany(context, [
        ["staged-safe", value],
        ["staged-unsafe", { kind: "json", value: { token: "raw" } } as never],
      ]),
    ).toThrow();
    await expect(nativeValues.get("staged-safe", "llm-core-values")).resolves.toBeNull();
    await expect(keyValue.deleteMany(context, ["doc-1"])).resolves.toBe(true);

    const documentStore = new KVDocumentStore(new SimpleKVStore(), "llm-core-documents");
    const documentValues = createLlamaIndexDocumentKeyValueStore(documentStore);
    await expect(
      documentValues.setMany(context, [
        ["node-1", jsonStorageValue(false)],
        ["node-2", resourceStorageValue(resource)],
      ]),
    ).resolves.toBe(true);
    await expect(documentValues.getMany(context, ["node-1", "node-2"])).resolves.toEqual([
      jsonStorageValue(false),
      resourceStorageValue(resource),
    ]);
    const nativeNode = await documentStore.getDocument("node-1", true);
    expect(nativeNode?.constructor.name).toBe("Document");
    await expect(documentValues.deleteMany(context, ["node-1", "node-2"])).resolves.toBe(true);
  });
});
