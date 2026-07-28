import type { BaseStore } from "@langchain/core/stores";
import type { Cache } from "../types";
import { createCacheAdapter, createEnvelope, isCacheRecord, type CacheRecord } from "../cache-core";

export function fromLangChainStoreCache(store: BaseStore<string, unknown>): Cache {
  return createCacheAdapter<unknown[], CacheRecord>({
    backend: {
      read: (key) => store.mget([key]),
      write: (key, entry) => store.mset([[key, entry]]),
      remove: (key) => store.mdelete([key]),
    },
    decode: (values) => {
      const value = Array.isArray(values) ? values[0] : values;
      return isCacheRecord(value) ? value : null;
    },
    encode: (_key, value, ttlMs) => createEnvelope(value, ttlMs),
  });
}
