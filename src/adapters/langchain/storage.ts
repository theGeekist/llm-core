import type { BaseStore } from "@langchain/core/stores";
import type { AdapterCallContext, KVStore } from "../types";
import { toTrue } from "../../shared/fp";
import { maybeMap } from "../../shared/maybe";
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
  function list(prefix?: string, _context?: AdapterCallContext) {
    void _context;
    return collectKeys(store, prefix);
  }

  return {
    mget: (keys, context) => {
      const diagnostics = validateKvKeys(keys, "mget");
      if (diagnostics.length > 0) {
        reportDiagnostics(context, diagnostics);
        return [];
      }
      return store.mget(keys);
    },
    mset: (pairs, context) => {
      const diagnostics = validateKvPairs(pairs);
      if (diagnostics.length > 0) {
        reportDiagnostics(context, diagnostics);
        return false;
      }
      return maybeMap(toTrue, store.mset(pairs));
    },
    mdelete: (keys, context) => {
      const diagnostics = validateKvKeys(keys, "mdelete");
      if (diagnostics.length > 0) {
        reportDiagnostics(context, diagnostics);
        return false;
      }
      return maybeMap(toTrue, store.mdelete(keys));
    },
    list,
  };
}
