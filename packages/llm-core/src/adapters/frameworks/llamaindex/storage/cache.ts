import {
  createCacheRecord,
  createCacheStoreAdapter,
  isCacheRecord,
  type CacheRecord,
  type CacheStore,
} from "../../../../features/storage/public";
import type { LlamaIndexKeyValueStore } from "./types";

export interface CreateLlamaIndexCacheStoreInput {
  readonly store: LlamaIndexKeyValueStore;
  readonly collection?: string;
}

export const createLlamaIndexCacheStore = ({
  store,
  collection,
}: CreateLlamaIndexCacheStoreInput): CacheStore =>
  createCacheStoreAdapter<unknown, CacheRecord>({
    backend: {
      read: (_context, key) => store.get(key, collection),
      write: (_context, { key, value }) => store.put(key, value, collection),
      remove: (_context, key) => store.delete(key, collection),
    },
    decode: (value) => (isCacheRecord(value) ? value : null),
    encode: (_key, value, ttlMs) => createCacheRecord(value, ttlMs),
  });
