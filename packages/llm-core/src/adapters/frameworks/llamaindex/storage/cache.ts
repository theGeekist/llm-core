import {
  createCacheRecord,
  createCacheStoreAdapter,
  isCacheRecord,
  type CacheRecord,
  type CacheStore,
} from "../../../../features/storage/public";

export interface CreateLlamaIndexCacheStoreInput {
  readonly store: BaseKVStore;
  readonly collection?: string;
}

export const createLlamaIndexCacheStore = ({
  store,
  collection,
}: CreateLlamaIndexCacheStoreInput): CacheStore =>
  createCacheStoreAdapter<unknown, { readonly cacheRecord: CacheRecord }>({
    backend: {
      read: ({ key }) => store.get(key, collection),
      write: ({ key, value }) => store.put(key, value, collection),
      remove: ({ key }) => store.delete(key, collection),
    },
    decode: (value) =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      "cacheRecord" in value &&
      isCacheRecord(value.cacheRecord)
        ? value.cacheRecord
        : null,
    encode: ({ value, ttlMs }) => ({ cacheRecord: createCacheRecord(value, ttlMs) }),
  });
import type { BaseKVStore } from "@llamaindex/core/storage/kv-store";
