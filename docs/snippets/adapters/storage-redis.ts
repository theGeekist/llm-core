// #region docs
import type { KVStore } from "#adapters";
// #endregion docs

const entries = new Map<string, unknown>();
const store: KVStore = {
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
// Store arbitrary session data
await store.mset([["user:123:preferences", { theme: "dark" }]]);
// #endregion docs
