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
        read: (_context, key) => values.get(key),
        write: (_context, { key, value }) => {
          values.set(key, value);
        },
        remove: (_context, key) => values.delete(key),
      },
      decode: (value) => value ?? null,
      encode: (_key, value, ttlMs) => createCacheRecord(value, ttlMs, () => now),
      now: () => now,
    });
    const value = jsonStorageValue({ cached: true });

    expect(cache.set(context, { key: "entry", value, ttlMs: 10 })).toBe(true);
    expect(cache.get(context, "entry")).toEqual(value);
    now += 11;
    expect(cache.get(context, "entry")).toBeNull();
    expect(cache.delete(context, "missing")).toBe(false);
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
      encode: (_key, entry) => createCacheRecord(entry),
    });

    await expect(cache.get(context, "async")).resolves.toEqual(value);
    await expect(cache.set(context, { key: "async", value })).resolves.toBe(true);
    await expect(cache.delete(context, "async")).resolves.toBeNull();
  });

  test("fails closed on invalid keys and TTL values", () => {
    const cache = createCacheStoreAdapter<CacheRecord, CacheRecord>({
      backend: {
        read: () => null,
        write: () => undefined,
        remove: () => undefined,
      },
      decode: () => null,
      encode: (_key, value) => createCacheRecord(value),
    });
    expect(() => cache.get(context, "")).toThrow();
    expect(() =>
      cache.set(context, { key: "key", value: jsonStorageValue(null), ttlMs: -1 }),
    ).toThrow();
  });
});
