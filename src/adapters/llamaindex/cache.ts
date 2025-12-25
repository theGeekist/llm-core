import type { BaseKVStore } from "@llamaindex/core/storage/kv-store";
import type { AdapterCallContext, Blob, Cache } from "../types";
import { bindFirst, fromPromiseLike, mapMaybe } from "../../maybe";
import { reportDiagnostics, validateStorageKey } from "../input-validation";

type LlamaIndexCacheOptions = {
  collection?: string;
};

const toUndefined = () => undefined;
const isBlob = (value: unknown): value is Blob =>
  typeof value === "object" && value !== null && value instanceof Object && "bytes" in value;
const readStoredValue = (value: unknown) => (isBlob(value) ? value : undefined);

const cacheGet = (
  store: BaseKVStore,
  collection: string | undefined,
  key: string,
  context?: AdapterCallContext,
) => {
  const diagnostics = validateStorageKey(key, "cache.get");
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return undefined;
  }
  return mapMaybe(fromPromiseLike(store.get(key, collection)), readStoredValue);
};

const cacheSet = (
  store: BaseKVStore,
  collection: string | undefined,
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
  return mapMaybe(fromPromiseLike(store.put(key, value, collection)), toUndefined);
};

const cacheDelete = (
  store: BaseKVStore,
  collection: string | undefined,
  key: string,
  context?: AdapterCallContext,
) => {
  const diagnostics = validateStorageKey(key, "cache.delete");
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return;
  }
  return mapMaybe(fromPromiseLike(store.delete(key, collection)), toUndefined);
};

export function fromLlamaIndexKVStoreCache(
  store: BaseKVStore,
  options?: LlamaIndexCacheOptions,
): Cache {
  const collection = options?.collection;
  return {
    get: bindFirst(bindFirst(cacheGet, store), collection),
    set: bindFirst(bindFirst(cacheSet, store), collection),
    delete: bindFirst(bindFirst(cacheDelete, store), collection),
  };
}
