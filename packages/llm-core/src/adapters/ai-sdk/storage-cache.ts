import type { MaybePromise } from "#shared/maybe";
import {
  createCacheRecord,
  createCacheStoreAdapter,
  isCacheRecord,
  type CacheRecord,
  type CacheStore,
} from "../../features/storage/public";

/**
 * Structural host cache contract. AI SDK 7 does not publish a cache-store API,
 * so this adapter intentionally makes no AI SDK conformance claim.
 */
export interface HostCacheBackend<T> {
  get(key: string): MaybePromise<T | undefined>;
  set(input: HostCacheSetInput<T>): MaybePromise<void>;
  delete(key: string): MaybePromise<boolean>;
  getDefaultTTL?(): unknown;
}

export interface HostCacheSetInput<T> {
  readonly key: string;
  readonly entry: T;
}

export interface CreateHostBackedCacheStoreInput {
  readonly store: HostCacheBackend<CacheRecord>;
  readonly defaultTtlMs?: unknown;
}

export const createHostBackedCacheStore = ({
  store,
  defaultTtlMs,
}: CreateHostBackedCacheStoreInput): CacheStore =>
  createCacheStoreAdapter<CacheRecord, CacheRecord>({
    backend: {
      read: ({ key }) => store.get(key),
      write: ({ key, value }) => store.set({ key, entry: value }),
      remove: ({ key }) => store.delete(key),
    },
    decode: (entry) => (isCacheRecord(entry) ? entry : null),
    encode: ({ value, ttlMs }) => createCacheRecord(value, ttlMs),
    resolveTtl: (ttlMs) => {
      if (ttlMs !== undefined) {
        return ttlMs;
      }
      if (defaultTtlMs !== undefined) {
        return defaultTtlMs;
      }
      return store.getDefaultTTL ? store.getDefaultTTL() : undefined;
    },
  });
