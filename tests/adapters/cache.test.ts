import { describe, expect, it } from "bun:test";
import {
  createCacheFromKVStore,
  createMemoryCache,
  fromAiSdkCacheStore,
  fromLangChainStoreCache,
  fromLlamaIndexKVStoreCache,
} from "#adapters";
import type { AdapterDiagnostic, AiSdkCacheStore, Blob } from "#adapters";
import {
  asAiSdkCacheStore,
  asLangChainStore,
  asLlamaIndexKVStore,
  assertSyncValue,
  captureDiagnostics,
} from "./helpers";

type AiSdkCacheEntry =
  Parameters<typeof fromAiSdkCacheStore>[0] extends AiSdkCacheStore<infer T> ? T : never;

describe("MemoryCache", () => {
  const blob: Blob = { bytes: new Uint8Array([1, 2, 3]), contentType: "application/octet-stream" };

  it("stores and retrieves values", async () => {
    const cache = createMemoryCache();
    await cache.set("key1", blob);
    const result = await cache.get("key1");
    expect(result).toEqual(blob);
  });

  it("returns null for missing keys", async () => {
    const cache = createMemoryCache();
    const result = await cache.get("missing");
    expect(result).toBeNull();
  });

  it("deletes values", async () => {
    const cache = createMemoryCache();
    await cache.set("key1", blob);
    await cache.delete("key1");
    const result = await cache.get("key1");
    expect(result).toBeNull();
  });

  it("respects TTL", async () => {
    const cache = createMemoryCache();
    await cache.set("key1", blob, 10); // 10ms TTL

    // Immediately available
    expect(await cache.get("key1")).toEqual(blob);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should be gone
    expect(await cache.get("key1")).toBeNull();
  });

  it("validates keys", async () => {
    const cache = createMemoryCache();
    const diagnostics: unknown[] = [];
    const context = {
      report: (d: AdapterDiagnostic) => diagnostics.push(d),
    };

    await cache.set("", blob, undefined, context);
    await cache.delete("", context);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(await cache.get("")).toBeNull();
  });
});

describe("Cache adapters", () => {
  const blob: Blob = { bytes: new Uint8Array([9, 9]), contentType: "application/octet-stream" };

  it("wraps KV stores as caches", async () => {
    const entries = new Map<string, Blob>();
    const store = {
      list: () => Array.from(entries.keys()),
      mget: (keys: string[]) => keys.map((key) => entries.get(key)),
      mset: (pairs: Array<[string, Blob]>) => {
        pairs.forEach(([key, value]) => entries.set(key, value));
        return null;
      },
      mdelete: (keys: string[]) => {
        keys.forEach((key) => entries.delete(key));
        return null;
      },
    };

    const cache = createCacheFromKVStore(store);
    await cache.set("kv-key", blob);
    expect(await cache.get("kv-key")).toEqual(blob);
    await cache.delete("kv-key");
    expect(await cache.get("kv-key")).toBeNull();
  });

  it("respects TTL for KV store caches", async () => {
    const entries = new Map<string, Blob>();
    const store = {
      list: () => Array.from(entries.keys()),
      mget: (keys: string[]) => keys.map((key) => entries.get(key)),
      mset: (pairs: Array<[string, Blob]>) => {
        pairs.forEach(([key, value]) => entries.set(key, value));
        return null;
      },
      mdelete: (keys: string[]) => {
        keys.forEach((key) => entries.delete(key));
        return null;
      },
    };

    const cache = createCacheFromKVStore(store);
    await cache.set("kv-ttl", blob, 5);
    expect(await cache.get("kv-ttl")).toEqual(blob);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cache.get("kv-ttl")).toBeNull();
  });

  it("wraps AI SDK cache stores and respects TTL", async () => {
    const entries = new Map<string, AiSdkCacheEntry>();
    const store = asAiSdkCacheStore<AiSdkCacheEntry>({
      get: (key: string) => entries.get(key),
      set: (key: string, entry: AiSdkCacheEntry) => {
        entries.set(key, entry);
      },
      delete: (key: string) => entries.delete(key),
      clear: () => entries.clear(),
      has: (key: string) => entries.has(key),
      size: () => entries.size,
      keys: () => Array.from(entries.keys()),
    });

    const cache = fromAiSdkCacheStore(store);
    await cache.set("ai-key", blob, 5);
    expect(await cache.get("ai-key")).toEqual(blob);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cache.get("ai-key")).toBeNull();
  });

  it("uses AI SDK default TTL when no ttl is provided", async () => {
    const entries = new Map<string, AiSdkCacheEntry>();
    const store = asAiSdkCacheStore<AiSdkCacheEntry>({
      get: (key: string) => entries.get(key),
      set: (key: string, entry: AiSdkCacheEntry) => {
        entries.set(key, entry);
      },
      delete: (key: string) => entries.delete(key),
      clear: () => entries.clear(),
      has: (key: string) => entries.has(key),
      size: () => entries.size,
      keys: () => Array.from(entries.keys()),
      getDefaultTTL: () => 1,
    });

    const cache = fromAiSdkCacheStore(store);
    await cache.set("ai-default-ttl", blob);
    expect(await cache.get("ai-default-ttl")).toEqual(blob);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await cache.get("ai-default-ttl")).toBeNull();
  });

  it("warns when AI SDK cache keys are missing", async () => {
    const store = asAiSdkCacheStore<AiSdkCacheEntry>({
      get: () => undefined,
      set: () => undefined,
      delete: () => true,
      clear: () => undefined,
      has: () => false,
      size: () => 0,
      keys: () => [],
    });
    const cache = fromAiSdkCacheStore(store);
    const { context, diagnostics } = captureDiagnostics();

    await cache.get("", context);
    await cache.set("", blob, undefined, context);
    await cache.delete("", context);

    const messages = diagnostics.map((entry) => entry.message);
    expect(messages).toContain("storage_key_missing");
  });

  it("returns undefined when AI SDK cache entry is missing", async () => {
    const store = asAiSdkCacheStore<AiSdkCacheEntry>({
      get: () => undefined,
      set: () => undefined,
      delete: () => true,
      clear: () => undefined,
      has: () => false,
      size: () => 0,
      keys: () => [],
    });
    const cache = fromAiSdkCacheStore(store);
    expect(await cache.get("missing")).toBeNull();
  });

  it("wraps LangChain stores as caches", async () => {
    const entries = new Map<string, unknown>();
    const store = asLangChainStore({
      mget: (keys: string[]) => Promise.resolve(keys.map((key) => entries.get(key))),
      mset: (pairs: Array<[string, unknown]>) => {
        pairs.forEach(([key, value]) => entries.set(key, value));
        return Promise.resolve();
      },
      mdelete: (keys: string[]) => {
        keys.forEach((key) => entries.delete(key));
        return Promise.resolve();
      },
      yieldKeys: async function* () {
        for (const key of entries.keys()) {
          yield key;
        }
      },
    });

    const cache = fromLangChainStoreCache(store);
    await cache.set("lc-key", blob);
    expect(await cache.get("lc-key")).toEqual(blob);
    await cache.delete("lc-key");
    expect(await cache.get("lc-key")).toBeNull();
  });

  it("respects TTL for LangChain caches", async () => {
    const entries = new Map<string, unknown>();
    const store = asLangChainStore({
      mget: (keys: string[]) => Promise.resolve(keys.map((key) => entries.get(key))),
      mset: (pairs: Array<[string, unknown]>) => {
        pairs.forEach(([key, value]) => entries.set(key, value));
        return Promise.resolve();
      },
      mdelete: (keys: string[]) => {
        keys.forEach((key) => entries.delete(key));
        return Promise.resolve();
      },
      yieldKeys: async function* () {
        for (const key of entries.keys()) {
          yield key;
        }
      },
    });

    const cache = fromLangChainStoreCache(store);
    await cache.set("lc-ttl", blob, 5);
    expect(await cache.get("lc-ttl")).toEqual(blob);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cache.get("lc-ttl")).toBeNull();
  });

  it("returns undefined when LangChain cache values are not blobs", async () => {
    const store = asLangChainStore({
      mget: () => Promise.resolve([null]),
      mset: () => Promise.resolve(),
      mdelete: () => Promise.resolve(),
      yieldKeys: async function* () {
        yield "key";
      },
    });

    const cache = fromLangChainStoreCache(store);
    expect(await cache.get("key")).toBeNull();
  });

  it("warns when LangChain cache keys are missing", async () => {
    const store = asLangChainStore({
      mget: () => Promise.resolve([]),
      mset: () => Promise.resolve(),
      mdelete: () => Promise.resolve(),
      yieldKeys: async function* () {
        yield "key";
      },
    });
    const cache = fromLangChainStoreCache(store);
    const { context, diagnostics } = captureDiagnostics();

    await cache.get("", context);
    await cache.set("", blob, undefined, context);
    await cache.delete("", context);

    const messages = diagnostics.map((entry) => entry.message);
    expect(messages).toContain("storage_key_missing");
  });

  it("wraps LlamaIndex kv stores as caches", async () => {
    const entries = new Map<string, unknown>();
    const store = asLlamaIndexKVStore({
      put: (key: string, value: unknown) => {
        entries.set(key, value);
        return Promise.resolve();
      },
      get: (key: string) => Promise.resolve(entries.get(key) ?? null),
      getAll: () =>
        Promise.resolve(
          Object.fromEntries(Array.from(entries.entries())) as Record<string, unknown>,
        ),
      delete: (key: string) => Promise.resolve(entries.delete(key)),
    });

    const cache = fromLlamaIndexKVStoreCache(store);
    await cache.set("li-key", blob);
    expect(await cache.get("li-key")).toEqual(blob);
    await cache.delete("li-key");
    expect(await cache.get("li-key")).toBeNull();
  });

  it("respects TTL for LlamaIndex caches", async () => {
    const entries = new Map<string, unknown>();
    const store = asLlamaIndexKVStore({
      put: (key: string, value: unknown) => {
        entries.set(key, value);
        return Promise.resolve();
      },
      get: (key: string) => Promise.resolve(entries.get(key) ?? null),
      getAll: () =>
        Promise.resolve(
          Object.fromEntries(Array.from(entries.entries())) as Record<string, unknown>,
        ),
      delete: (key: string) => Promise.resolve(entries.delete(key)),
    });

    const cache = fromLlamaIndexKVStoreCache(store);
    await cache.set("li-ttl", blob, 5);
    expect(await cache.get("li-ttl")).toEqual(blob);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cache.get("li-ttl")).toBeNull();
  });
  it("returns undefined when LlamaIndex cache values are not blobs", async () => {
    const store = asLlamaIndexKVStore({
      put: () => Promise.resolve(),
      get: () => Promise.resolve({}),
      getAll: () => Promise.resolve({}),
      delete: () => Promise.resolve(true),
    });

    const cache = fromLlamaIndexKVStoreCache(store);
    expect(await cache.get("key")).toBeNull();
  });

  it("warns when LlamaIndex cache keys are missing", async () => {
    const store = asLlamaIndexKVStore({
      put: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      getAll: () => Promise.resolve({}),
      delete: () => Promise.resolve(true),
    });
    const cache = fromLlamaIndexKVStoreCache(store);
    const { context, diagnostics } = captureDiagnostics();

    await cache.get("", context);
    await cache.set("", blob, undefined, context);
    await cache.delete("", context);

    const messages = diagnostics.map((entry) => entry.message);
    expect(messages).toContain("storage_key_missing");
  });

  it("keeps cache.get synchronous when the store is synchronous", () => {
    const entries = new Map<string, AiSdkCacheEntry>();
    const store = asAiSdkCacheStore<AiSdkCacheEntry>({
      get: (key: string) => entries.get(key),
      set: (key: string, entry: AiSdkCacheEntry) => {
        entries.set(key, entry);
      },
      delete: (key: string) => entries.delete(key),
      clear: () => entries.clear(),
      has: (key: string) => entries.has(key),
      size: () => entries.size,
      keys: () => Array.from(entries.keys()),
    });

    const cache = fromAiSdkCacheStore(store);
    cache.set("sync-key", blob);
    const value = assertSyncValue(cache.get("sync-key"));
    expect(value).toEqual(blob);
  });
});
