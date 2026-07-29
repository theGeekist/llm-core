import type { MaybePromise } from "#shared/maybe";
import {
  createCacheRecord,
  createCacheStoreAdapter,
  isCacheRecord,
  type CacheRecord,
  type CacheStore,
} from "../../../../features/storage/public";

/**
 * Structural host cache contract. AI SDK 7 does not publish a cache-store API,
 * so this adapter intentionally makes no AI SDK conformance claim.
 */
export interface HostCacheBackend<T> {
  get(key: string): MaybePromise<T | undefined>;
  set(key: string, entry: T): MaybePromise<void>;
  delete(key: string): MaybePromise<boolean>;
  getDefaultTTL?(): unknown;
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
      read: (_context, key) => store.get(key),
      write: (_context, { key, value }) => store.set(key, value),
      remove: (_context, key) => store.delete(key),
    },
    decode: (entry) => (isCacheRecord(entry) ? entry : null),
    encode: (_key, value, ttlMs) => createCacheRecord(value, ttlMs),
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
