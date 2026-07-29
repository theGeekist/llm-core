import type { BaseStore } from "@langchain/core/stores";
import type { KVStore } from "../types";
import { toTrue } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import { reportDiagnostics, validateKvKeys, validateKvPairs } from "../input-validation";

const collectKeys = async (store: BaseStore<string, unknown>, prefix?: string) => {
  const keys = store.yieldKeys(prefix);
  const result: string[] = [];
  for await (const key of keys) {
    result.push(String(key));
  }
  return result;
};

export function fromLangChainStore(store: BaseStore<string, unknown>): KVStore {
  function list({ prefix }: Parameters<KVStore["list"]>[0]) {
    return collectKeys(store, prefix);
  }

  return {
    mget: ({ keys, context }) => {
      const diagnostics = validateKvKeys(keys, "mget");
      if (reportDiagnostics(context, diagnostics)) {
        return [];
      }
      return store.mget(keys);
    },
    mset: ({ pairs, context }) => {
      const diagnostics = validateKvPairs(pairs);
      if (reportDiagnostics(context, diagnostics)) {
        return false;
      }
      return maybeMap(toTrue, store.mset(pairs));
    },
    mdelete: ({ keys, context }) => {
      const diagnostics = validateKvKeys(keys, "mdelete");
      if (reportDiagnostics(context, diagnostics)) {
        return false;
      }
      return maybeMap(toTrue, store.mdelete(keys));
    },
    list,
  };
}
