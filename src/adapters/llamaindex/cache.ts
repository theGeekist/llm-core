import type { BaseKVStore } from "@llamaindex/core/storage/kv-store";
import type { AdapterCallContext, Blob, Cache } from "../types";
import { maybeMap, toNull, toTrue } from "../../maybe";
import { reportDiagnostics, validateStorageKey } from "../input-validation";

type LlamaIndexCacheOptions = {
  collection?: string;
};
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

const toBoolean = (value: unknown): boolean | null => (value === null ? null : value !== false);

const isExpired = (envelope: CacheEnvelope | undefined) =>
  typeof envelope?.expiresAt === "number" && Date.now() > envelope.expiresAt;

const deleteEntry = (store: BaseKVStore, collection: string | undefined, key: string) =>
  maybeMap(toBoolean, store.delete(key, collection));

const readEntry = (
  store: BaseKVStore,
  collection: string | undefined,
  key: string,
  value: unknown,
) => {
  const envelope = readEnvelope(value);
  if (envelope) {
    if (isExpired(envelope)) {
      return maybeMap(toNull, deleteEntry(store, collection, key));
    }
    return envelope.value;
  }
  return readStoredValue(value) ?? null;
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
    return null;
  }

  const handleEntry = (entry: unknown) => readEntry(store, collection, key, entry);

  return maybeMap(handleEntry, store.get(key, collection));
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
    return false;
  }
  const entry = toEnvelope(value, ttlMs);
  return maybeMap(toTrue, store.put(key, entry, collection));
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
    return false;
  }
  return maybeMap(toBoolean, store.delete(key, collection));
};

export function fromLlamaIndexKVStoreCache(
  store: BaseKVStore,
  options?: LlamaIndexCacheOptions,
): Cache {
  const collection = options?.collection;

  return {
    get: (key, context) => cacheGet(store, collection, key, context),
    set: (key, value, ttlMs, context) => cacheSet(store, collection, key, value, ttlMs, context),
    delete: (key, context) => cacheDelete(store, collection, key, context),
  };
}
