const entries = new Map();

/** @param {string[]} keys */
const listValues = (keys) => keys.map((key) => entries.get(key));

/** @param {Array<[string, import("@geekist/llm-core/adapters").Blob]>} pairs */
const setValues = (pairs) => {
  pairs.forEach(([key, value]) => entries.set(key, value));
  return true;
};

/** @param {string[]} keys */
const deleteValues = (keys) => {
  keys.forEach((key) => entries.delete(key));
  return true;
};

/** @type {import("@geekist/llm-core/adapters").KVStore<import("@geekist/llm-core/adapters").Blob>} */
const store = {
  list: () => Array.from(entries.keys()),
  mget: listValues,
  mset: setValues,
  mdelete: deleteValues,
};

// #region docs
const encoder = new TextEncoder();
const payload = encoder.encode(JSON.stringify({ theme: "dark" }));

// Store arbitrary session data
await store.mset([["user:123:preferences", { bytes: payload, contentType: "application/json" }]]);
// #endregion docs
