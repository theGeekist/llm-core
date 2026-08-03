import {
  createCacheRecord,
  createCacheStoreAdapter,
  isCacheRecord,
  type CacheRecord,
  type CacheStore,
} from "../../features/storage/public";
import type { LangChainBaseStore } from "./storage-types";

export const createLangChainCacheStore = (store: LangChainBaseStore<CacheRecord>): CacheStore =>
  createCacheStoreAdapter<readonly (CacheRecord | undefined)[], CacheRecord>({
    backend: {
      read: ({ key }) => store.mget([key]),
      write: ({ key, value }) => store.mset([[key, value]]),
      remove: ({ key }) => store.mdelete([key]),
    },
    decode: (values) => {
      const value = values?.[0];
      return isCacheRecord(value) ? value : null;
    },
    encode: ({ value, ttlMs }) => createCacheRecord(value, ttlMs),
  });
