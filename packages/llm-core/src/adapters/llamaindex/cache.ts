import type { BaseKVStore } from "@llamaindex/core/storage/kv-store";
import type { Cache } from "../types";
import { createCacheAdapter, createEnvelope, isCacheRecord } from "../cache-core";

type LlamaIndexCacheOptions = {
  collection?: string;
};
export function fromLlamaIndexKVStoreCache(
  store: BaseKVStore,
  options?: LlamaIndexCacheOptions,
): Cache {
  const collection = options?.collection;

  return createCacheAdapter<unknown, Record<string, unknown>>({
    backend: {
      read: (key) => store.get(key, collection),
      write: (key, entry) => store.put(key, entry, collection),
      remove: (key) => store.delete(key, collection),
    },
    decode: (value) => (isCacheRecord(value) ? value : null),
    encode: (_key, value, ttlMs): Record<string, unknown> => ({
      ...createEnvelope(value, ttlMs),
    }),
  });
}
