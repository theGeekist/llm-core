import { describe, expect, test } from "bun:test";
import {
  createCacheRecord,
  createCacheStoreAdapter,
  jsonStorageValue,
  type CacheRecord,
} from "../../src/features/storage/public";
import { context } from "./helpers";

describe("cache store policy", () => {
  test("preserves sync behavior, tri-state mutation results and TTL expiry", () => {
    let now = Date.parse("2026-07-29T10:00:00.000Z");
    const values = new Map<string, CacheRecord>();
    const cache = createCacheStoreAdapter<CacheRecord, CacheRecord>({
      backend: {
        read: ({ key }) => values.get(key),
        write: ({ key, value }) => {
          values.set(key, value);
        },
        remove: ({ key }) => values.delete(key),
      },
      decode: (value) => value ?? null,
      encode: ({ value, ttlMs }) => createCacheRecord(value, ttlMs, () => now),
      now: () => now,
    });
    const value = jsonStorageValue({ cached: true });

    expect(cache.set({ context, key: "entry", value, ttlMs: 10 })).toBe(true);
    expect(cache.get({ context, key: "entry" })).toEqual(value);
    now += 10;
    expect(cache.get({ context, key: "entry" })).toBeNull();
    expect(cache.delete({ context, key: "missing" })).toBe(false);
  });

  test("preserves async behavior and unknown deletion as null", async () => {
    const value = jsonStorageValue("value");
    const cache = createCacheStoreAdapter<CacheRecord, CacheRecord>({
      backend: {
        read: async () => createCacheRecord(value),
        write: async () => undefined,
        remove: async () => null,
      },
      decode: (entry) => entry ?? null,
      encode: ({ value: entry }) => createCacheRecord(entry),
    });

    await expect(cache.get({ context, key: "async" })).resolves.toEqual(value);
    await expect(cache.set({ context, key: "async", value })).resolves.toBe(true);
    await expect(cache.delete({ context, key: "async" })).resolves.toBeNull();
  });

  test("expires zero TTL at the equality boundary", () => {
    const now = Date.parse("2026-07-29T10:00:00.000Z");
    const values = new Map<string, CacheRecord>();
    let removals = 0;
    const cache = createCacheStoreAdapter<CacheRecord, CacheRecord>({
      backend: {
        read: ({ key }) => values.get(key),
        write: ({ key, value }) => void values.set(key, value),
        remove: ({ key }) => {
          removals += 1;
          return values.delete(key);
        },
      },
      decode: (entry) => entry ?? null,
      encode: ({ value, ttlMs }) => createCacheRecord(value, ttlMs, () => now),
      now: () => now,
    });

    expect(cache.set({ context, key: "zero", value: jsonStorageValue("value"), ttlMs: 0 })).toBe(
      true,
    );
    expect(cache.get({ context, key: "zero" })).toBeNull();
    expect(removals).toBe(1);
  });

  test("fails closed before encoding or writing invalid explicit and resolved TTLs", () => {
    let encodes = 0;
    let writes = 0;
    const cache = createCacheStoreAdapter<CacheRecord, CacheRecord>({
      backend: {
        read: () => null,
        write: () => {
          writes += 1;
        },
        remove: () => undefined,
      },
      decode: () => null,
      encode: ({ value }) => {
        encodes += 1;
        return createCacheRecord(value);
      },
    });
    expect(() => cache.get({ context, key: "" })).toThrow();
    const invalidRuntimeTtls: unknown[] = [
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "1000",
      0.5,
      -1,
      Number.MAX_SAFE_INTEGER,
    ];
    for (const ttlMs of invalidRuntimeTtls) {
      expect(() =>
        cache.set({
          context,
          key: "key",
          value: jsonStorageValue(null),
          ttlMs: ttlMs as never,
        }),
      ).toThrow();
    }

    for (const resolvedTtl of invalidRuntimeTtls) {
      const resolved = createCacheStoreAdapter<CacheRecord, CacheRecord>({
        backend: {
          read: () => null,
          write: () => {
            writes += 1;
          },
          remove: () => undefined,
        },
        decode: () => null,
        encode: ({ value }) => {
          encodes += 1;
          return createCacheRecord(value);
        },
        resolveTtl: () => resolvedTtl,
      });
      expect(() => resolved.set({ context, key: "key", value: jsonStorageValue(null) })).toThrow();
    }
    expect({ encodes, writes }).toEqual({ encodes: 0, writes: 0 });
  });
});
