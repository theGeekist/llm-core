import type { BaseStore } from "@langchain/core/stores";
import type { AdapterCallContext, Blob, Cache } from "../types";
import { bindFirst, fromPromiseLike, mapMaybe } from "../../maybe";
import { reportDiagnostics, validateStorageKey } from "../input-validation";

const toUndefined = () => undefined;
const isBlob = (value: unknown): value is Blob =>
  typeof value === "object" && value !== null && value instanceof Object && "bytes" in value;

const readBlob = (value: unknown) => (isBlob(value) ? value : undefined);

const readFirst = (values: Array<unknown | undefined>) => readBlob(values[0]);

const cacheGet = (store: BaseStore<string, unknown>, key: string, context?: AdapterCallContext) => {
  const diagnostics = validateStorageKey(key, "cache.get");
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return undefined;
  }
  return mapMaybe(fromPromiseLike(store.mget([key])), readFirst);
};

const cacheSet = (
  store: BaseStore<string, unknown>,
  key: string,
  value: Blob,
  _ttlMs?: number,
  context?: AdapterCallContext,
) => {
  void _ttlMs;
  const diagnostics = validateStorageKey(key, "cache.set");
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return;
  }
  return mapMaybe(fromPromiseLike(store.mset([[key, value]])), toUndefined);
};

const cacheDelete = (
  store: BaseStore<string, unknown>,
  key: string,
  context?: AdapterCallContext,
) => {
  const diagnostics = validateStorageKey(key, "cache.delete");
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return;
  }
  return mapMaybe(fromPromiseLike(store.mdelete([key])), toUndefined);
};

export function fromLangChainStoreCache(store: BaseStore<string, unknown>): Cache {
  return {
    get: bindFirst(cacheGet, store),
    set: bindFirst(cacheSet, store),
    delete: bindFirst(cacheDelete, store),
  };
}
