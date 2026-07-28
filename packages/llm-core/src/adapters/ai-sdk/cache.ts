import type { Blob, Cache } from "../types";
import { createCacheAdapter, createEnvelope } from "../cache-core";

export type AiSdkCacheStore<T = unknown> = {
  get(key: string): T | undefined | Promise<T | undefined>;
  set(key: string, entry: T): void | Promise<void>;
  delete(key: string): boolean | Promise<boolean>;
  clear(): void | Promise<void>;
  has(key: string): boolean | Promise<boolean>;
  size(): number | Promise<number>;
  keys(): string[] | Promise<string[]>;
  getDefaultTTL?(): number | undefined;
};

type CacheEntry = {
  result: ReturnType<typeof createEnvelope>;
  timestamp: number;
  key: string;
};

const toEntry = (key: string, value: Blob, ttlMs?: number): CacheEntry => ({
  key,
  timestamp: Date.now(),
  result: createEnvelope(value, ttlMs),
});

export type AiSdkCacheOptions = {
  defaultTtlMs?: number;
};

export function fromAiSdkCacheStore(
  store: AiSdkCacheStore<CacheEntry>,
  options?: AiSdkCacheOptions,
): Cache {
  return createCacheAdapter<CacheEntry, CacheEntry>({
    backend: {
      read: (key) => store.get(key),
      write: (key, entry) => store.set(key, entry),
      remove: (key) => store.delete(key),
    },
    decode: (entry) => entry?.result ?? null,
    encode: toEntry,
    resolveTtl: (ttlMs) => ttlMs ?? options?.defaultTtlMs ?? store.getDefaultTTL?.(),
  });
}
