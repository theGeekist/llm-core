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
  Parameters<typeof fromAiSdkCacheStore>[0]["store"] extends AiSdkCacheStore<infer T> ? T : never;

describe("MemoryCache", () => {
  const blob: Blob = { bytes: new Uint8Array([1, 2, 3]), contentType: "application/octet-stream" };

  it("stores and retrieves values", async () => {
    const cache = createMemoryCache();
    await cache.set({ key: "key1", value: blob });
    const result = await cache.get({ key: "key1" });
    expect(result).toEqual(blob);
  });

  it("returns null for missing keys", async () => {
    const cache = createMemoryCache();
    const result = await cache.get({ key: "missing" });
    expect(result).toBeNull();
  });

  it("deletes values", async () => {
    const cache = createMemoryCache();
    await cache.set({ key: "key1", value: blob });
    await cache.delete({ key: "key1" });
    const result = await cache.get({ key: "key1" });
    expect(result).toBeNull();
  });

  it("respects TTL", async () => {
    const cache = createMemoryCache();
    await cache.set({ key: "key1", value: blob, ttlMs: 10 }); // 10ms TTL

    // Immediately available
    expect(await cache.get({ key: "key1" })).toEqual(blob);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should be gone
    expect(await cache.get({ key: "key1" })).toBeNull();
  });

  it("validates keys", async () => {
    const cache = createMemoryCache();
    const diagnostics: unknown[] = [];
    const context = {
      report: (d: AdapterDiagnostic) => diagnostics.push(d),
    };

    await cache.set({ key: "", value: blob, context });
    await cache.delete({ key: "", context });
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(await cache.get({ key: "" })).toBeNull();
  });
});

describe("Cache adapters", () => {
  const blob: Blob = { bytes: new Uint8Array([9, 9]), contentType: "application/octet-stream" };

  it("wraps KV stores as caches", async () => {
    const entries = new Map<string, Blob>();
    const store = {
      list: () => Array.from(entries.keys()),
      mget: ({ keys }: { keys: string[] }) => keys.map((key) => entries.get(key)),
      mset: ({ pairs }: { pairs: Array<[string, Blob]> }) => {
        pairs.forEach(([key, value]) => entries.set(key, value));
        return null;
      },
      mdelete: ({ keys }: { keys: string[] }) => {
        keys.forEach((key) => entries.delete(key));
        return null;
      },
    };

    const cache = createCacheFromKVStore({
      ...store,
      mget: (request) => store.mget(request).map((val) => val ?? null),
    });
    await cache.set({ key: "kv-key", value: blob });
    expect(await cache.get({ key: "kv-key" })).toEqual(blob);
    await cache.delete({ key: "kv-key" });
    expect(await cache.get({ key: "kv-key" })).toBeNull();
  });

  it("respects TTL for KV store caches", async () => {
    const entries = new Map<string, Blob>();
    const store = {
      list: () => Array.from(entries.keys()),
      mget: ({ keys }: { keys: string[] }) => keys.map((key) => entries.get(key)),
      mset: ({ pairs }: { pairs: Array<[string, Blob]> }) => {
        pairs.forEach(([key, value]) => entries.set(key, value));
        return null;
      },
      mdelete: ({ keys }: { keys: string[] }) => {
        keys.forEach((key) => entries.delete(key));
        return null;
      },
    };

    const cache = createCacheFromKVStore({
      ...store,
      mget: (request) => store.mget(request).map((val) => val ?? null),
    });
    await cache.set({ key: "kv-ttl", value: blob, ttlMs: 5 });
    expect(await cache.get({ key: "kv-ttl" })).toEqual(blob);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cache.get({ key: "kv-ttl" })).toBeNull();
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

    const cache = fromAiSdkCacheStore({ store });
    await cache.set({ key: "ai-key", value: blob, ttlMs: 5 });
    expect(await cache.get({ key: "ai-key" })).toEqual(blob);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cache.get({ key: "ai-key" })).toBeNull();
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

    const cache = fromAiSdkCacheStore({ store });
    await cache.set({ key: "ai-default-ttl", value: blob });
    expect(await cache.get({ key: "ai-default-ttl" })).toEqual(blob);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await cache.get({ key: "ai-default-ttl" })).toBeNull();
  });

  it("prefers explicit and configured AI SDK TTLs over the store default", async () => {
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
      getDefaultTTL: () => 10,
    });
    const cache = fromAiSdkCacheStore({ store, defaultTtlMs: 20 });

    await cache.set({ key: "configured", value: blob });
    await cache.set({ key: "explicit", value: blob, ttlMs: 30 });

    const configured = entries.get("configured");
    const explicit = entries.get("explicit");
    const configuredTtl = (configured?.result.expiresAt ?? 0) - (configured?.timestamp ?? 0);
    const explicitTtl = (explicit?.result.expiresAt ?? 0) - (explicit?.timestamp ?? 0);
    expect(configuredTtl).toBeGreaterThanOrEqual(20);
    expect(configuredTtl).toBeLessThan(25);
    expect(explicitTtl).toBeGreaterThanOrEqual(30);
    expect(explicitTtl).toBeLessThan(35);
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
    const cache = fromAiSdkCacheStore({ store });
    const { context, diagnostics } = captureDiagnostics();

    await cache.get({ key: "", context });
    await cache.set({ key: "", value: blob, context });
    await cache.delete({ key: "", context });

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
    const cache = fromAiSdkCacheStore({ store });
    expect(await cache.get({ key: "missing" })).toBeNull();
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
    await cache.set({ key: "lc-key", value: blob });
    expect(await cache.get({ key: "lc-key" })).toEqual(blob);
    await cache.delete({ key: "lc-key" });
    expect(await cache.get({ key: "lc-key" })).toBeNull();
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
    await cache.set({ key: "lc-ttl", value: blob, ttlMs: 5 });
    expect(await cache.get({ key: "lc-ttl" })).toEqual(blob);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cache.get({ key: "lc-ttl" })).toBeNull();
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
    expect(await cache.get({ key: "key" })).toBeNull();
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

    await cache.get({ key: "", context });
    await cache.set({ key: "", value: blob, context });
    await cache.delete({ key: "", context });

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

    const cache = fromLlamaIndexKVStoreCache({ store });
    await cache.set({ key: "li-key", value: blob });
    expect(await cache.get({ key: "li-key" })).toEqual(blob);
    await cache.delete({ key: "li-key" });
    expect(await cache.get({ key: "li-key" })).toBeNull();
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

    const cache = fromLlamaIndexKVStoreCache({ store });
    await cache.set({ key: "li-ttl", value: blob, ttlMs: 5 });
    expect(await cache.get({ key: "li-ttl" })).toEqual(blob);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cache.get({ key: "li-ttl" })).toBeNull();
  });
  it("returns undefined when LlamaIndex cache values are not blobs", async () => {
    const store = asLlamaIndexKVStore({
      put: () => Promise.resolve(),
      get: () => Promise.resolve({}),
      getAll: () => Promise.resolve({}),
      delete: () => Promise.resolve(true),
    });

    const cache = fromLlamaIndexKVStoreCache({ store });
    expect(await cache.get({ key: "key" })).toBeNull();
  });

  it("warns when LlamaIndex cache keys are missing", async () => {
    const store = asLlamaIndexKVStore({
      put: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      getAll: () => Promise.resolve({}),
      delete: () => Promise.resolve(true),
    });
    const cache = fromLlamaIndexKVStoreCache({ store });
    const { context, diagnostics } = captureDiagnostics();

    await cache.get({ key: "", context });
    await cache.set({ key: "", value: blob, context });
    await cache.delete({ key: "", context });

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

    const cache = fromAiSdkCacheStore({ store });
    cache.set({ key: "sync-key", value: blob });
    const value = assertSyncValue(cache.get({ key: "sync-key" }));
    expect(value).toEqual(blob);
  });

  it("preserves KV metadata, hides expiry metadata, and forwards context", async () => {
    const entries = new Map<string, Blob>();
    const calls: Array<{ operation: string; context: unknown }> = [];
    const store = {
      list: () => Array.from(entries.keys()),
      mget: ({ keys, context }: { keys: string[]; context?: unknown }) => {
        calls.push({ operation: "get", context });
        return keys.map((key) => entries.get(key) ?? null);
      },
      mset: ({ pairs, context }: { pairs: Array<[string, Blob]>; context?: unknown }) => {
        calls.push({ operation: "set", context });
        pairs.forEach(([key, value]) => entries.set(key, value));
        return null;
      },
      mdelete: ({ keys, context }: { keys: string[]; context?: unknown }) => {
        calls.push({ operation: "delete", context });
        keys.forEach((key) => entries.delete(key));
        return false;
      },
    };
    const cache = createCacheFromKVStore(store);
    const context = captureDiagnostics().context;
    const value = { ...blob, metadata: { source: "test" } };

    expect(await cache.set({ key: "metadata", value, ttlMs: 5, context })).toBeNull();
    expect(entries.get("metadata")?.metadata).toMatchObject({
      source: "test",
      __cacheExpiresAt: expect.any(Number),
    });
    expect(await cache.get({ key: "metadata", context })).toEqual(value);

    entries.set("metadata", {
      ...value,
      metadata: { ...value.metadata, __cacheExpiresAt: Date.now() - 1 },
    });
    expect(await cache.get({ key: "metadata", context })).toBeNull();
    expect(calls.map((call) => call.operation)).toEqual(["set", "get", "get", "delete"]);
    expect(calls.every((call) => call.context === context)).toBe(true);
  });

  it("preserves cache-specific delete result semantics", async () => {
    expect(await createMemoryCache().delete({ key: "missing" })).toBe(true);

    const aiStore = asAiSdkCacheStore<AiSdkCacheEntry>({
      get: () => undefined,
      set: () => undefined,
      delete: () => false,
      clear: () => undefined,
      has: () => false,
      size: () => 0,
      keys: () => [],
    });
    expect(await fromAiSdkCacheStore({ store: aiStore }).delete({ key: "missing" })).toBe(false);
  });
});
