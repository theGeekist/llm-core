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

type CacheEnvelope = {
  value: Blob;
  expiresAt?: number;
};

const isEnvelope = (value: unknown): value is CacheEnvelope =>
  typeof value === "object" && value !== null && "value" in value;

const readEnvelope = (value: unknown) => (isEnvelope(value) ? value : undefined);

const readStoredValue = (value: unknown) => (isBlob(value) ? value : undefined);

const toEnvelope = (value: Blob, ttlMs?: number): CacheEnvelope => ({
  value,
  expiresAt: typeof ttlMs === "number" ? Date.now() + ttlMs : undefined,
});

const isExpired = (envelope: CacheEnvelope | undefined) =>
  typeof envelope?.expiresAt === "number" && Date.now() > envelope.expiresAt;

const deleteEntry = (store: BaseKVStore, collection: string | undefined, key: string) =>
  mapMaybe(fromPromiseLike(store.delete(key, collection)), toUndefined);

const readEntry = (
  store: BaseKVStore,
  collection: string | undefined,
  key: string,
  value: unknown,
) => {
  const envelope = readEnvelope(value);
  if (envelope) {
    if (isExpired(envelope)) {
      return mapMaybe(deleteEntry(store, collection, key), toUndefined);
    }
    return envelope.value;
  }
  return readStoredValue(value);
};

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
  const handleEntry = bindFirst(bindFirst(bindFirst(readEntry, store), collection), key);
  return mapMaybe(fromPromiseLike(store.get(key, collection)), handleEntry);
};

const cacheSet = (
  store: BaseKVStore,
  collection: string | undefined,
  key: string,
  value: Blob,
  ttlMs?: number,
  context?: AdapterCallContext,
) => {
  const diagnostics = validateStorageKey(key, "cache.set");
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return;
  }
  const entry = toEnvelope(value, ttlMs);
  return mapMaybe(fromPromiseLike(store.put(key, entry, collection)), toUndefined);
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
