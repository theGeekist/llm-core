import type { BaseStore } from "@langchain/core/stores";
import type { AdapterKVStore } from "../types";

const collectKeys = async (store: BaseStore<string, unknown>, prefix?: string) => {
  const keys = store.yieldKeys(prefix);
  const result: string[] = [];
  for await (const key of keys) {
    result.push(String(key));
  }
  return result;
};

export function fromLangChainStore(store: BaseStore<string, unknown>): AdapterKVStore {
  function list(prefix?: string) {
    return collectKeys(store, prefix);
  }

  return {
    mget: (keys) => store.mget(keys),
    mset: (pairs) => store.mset(pairs),
    mdelete: (keys) => store.mdelete(keys),
    list,
  };
}
