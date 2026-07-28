// #region docs
import { createCacheFromKVStore } from "#adapters";
// #endregion docs

/** @type {Map<string, import("@geekist/llm-core/adapters").Blob>} */
const entries = new Map();

/** @param {{ keys: string[] }} request */
const listValues = ({ keys }) => keys.map((key) => entries.get(key) ?? null);

/** @param {{ pairs: Array<[string, import("@geekist/llm-core/adapters").Blob]> }} request */
const setValues = ({ pairs }) => {
  pairs.forEach(([key, value]) => entries.set(key, value));
  return true;
};

/** @param {{ keys: string[] }} request */
const deleteValues = ({ keys }) => {
  keys.forEach((key) => entries.delete(key));
  return true;
};

/** @type {import("@geekist/llm-core/adapters").KVStore<import("@geekist/llm-core/adapters").Blob>} */
const kv = {
  list: () => Array.from(entries.keys()),
  mget: listValues,
  mset: setValues,
  mdelete: deleteValues,
};

// #region docs
// Turn a KV store into a durable cache
const redisCache = createCacheFromKVStore(kv);
// #endregion docs

void redisCache;
