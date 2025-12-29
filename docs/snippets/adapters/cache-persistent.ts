// #region docs
import { createCacheFromKVStore } from "#adapters";
import type { Blob, Cache, KVStore } from "#adapters";
// #endregion docs

const entries = new Map<string, Blob>();
const kv: KVStore<Blob> = {
  list: () => Array.from(entries.keys()),
  mget: (keys) => keys.map((key) => entries.get(key)),
  mset: (pairs) => {
    pairs.forEach(([key, value]) => entries.set(key, value));
    return true;
  },
  mdelete: (keys) => {
    keys.forEach((key) => entries.delete(key));
    return true;
  },
};

// #region docs
// Turn a KV store into a durable cache
const redisCache: Cache = createCacheFromKVStore(kv);
// #endregion docs

void redisCache;
