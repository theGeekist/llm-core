import {
  createCacheRecord,
  createCacheStoreAdapter,
  isCacheRecord,
  type CacheRecord,
  type CacheStore,
} from "../../../../features/storage/public";
import type { LangChainBaseStore } from "./types";

export const createLangChainCacheStore = (store: LangChainBaseStore<CacheRecord>): CacheStore =>
  createCacheStoreAdapter<readonly (CacheRecord | undefined)[], CacheRecord>({
    backend: {
      read: (_context, key) => store.mget([key]),
      write: (_context, { key, value }) => store.mset([[key, value]]),
      remove: (_context, key) => store.mdelete([key]),
    },
    decode: (values) => {
      const value = values?.[0];
      return isCacheRecord(value) ? value : null;
    },
    encode: (_key, value, ttlMs) => createCacheRecord(value, ttlMs),
  });
