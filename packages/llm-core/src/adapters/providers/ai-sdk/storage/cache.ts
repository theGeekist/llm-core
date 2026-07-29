import type { MaybePromise } from "#shared/maybe";
import {
  createCacheRecord,
  createCacheStoreAdapter,
  isCacheRecord,
  type CacheRecord,
  type CacheStore,
} from "../../../../features/storage/public";

export interface AiSdkCacheStore<T> {
  get(key: string): MaybePromise<T | undefined>;
  set(key: string, entry: T): MaybePromise<void>;
  delete(key: string): MaybePromise<boolean>;
  getDefaultTTL?(): number | undefined;
}

export interface CreateAiSdkCacheStoreInput {
  readonly store: AiSdkCacheStore<CacheRecord>;
  readonly defaultTtlMs?: number;
}

export const createAiSdkCacheStore = ({
  store,
  defaultTtlMs,
}: CreateAiSdkCacheStoreInput): CacheStore =>
  createCacheStoreAdapter<CacheRecord, CacheRecord>({
    backend: {
      read: (_context, key) => store.get(key),
      write: (_context, { key, value }) => store.set(key, value),
      remove: (_context, key) => store.delete(key),
    },
    decode: (entry) => (isCacheRecord(entry) ? entry : null),
    encode: (_key, value, ttlMs) => createCacheRecord(value, ttlMs),
    resolveTtl: (ttlMs) => ttlMs ?? defaultTtlMs ?? store.getDefaultTTL?.(),
  });
