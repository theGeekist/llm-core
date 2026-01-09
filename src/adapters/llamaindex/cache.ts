import type { BaseKVStore } from "@llamaindex/core/storage/kv-store";
import type { AdapterCallContext, Blob, Cache } from "../types";
import { bindFirst, toNull, toTrue } from "../../shared/fp";
import { maybeMap } from "../../shared/maybe";
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

type ReadEntryInput = {
  store: BaseKVStore;
  collection: string | undefined;
  key: string;
  value: unknown;
};

const readEntry = (input: ReadEntryInput) => {
  const envelope = readEnvelope(input.value);
  if (envelope) {
    if (isExpired(envelope)) {
      return maybeMap(toNull, deleteEntry(input.store, input.collection, input.key));
    }
    return envelope.value;
  }
  return readStoredValue(input.value) ?? null;
};

type CacheGetInput = {
  store: BaseKVStore;
  collection: string | undefined;
  key: string;
  context?: AdapterCallContext;
};

const cacheGet = (input: CacheGetInput) => {
  const diagnostics = validateStorageKey(input.key, "cache.get");
  if (diagnostics.length > 0) {
    reportDiagnostics(input.context, diagnostics);
    return null;
  }

  const handleEntry = (entry: unknown) =>
    readEntry({
      store: input.store,
      collection: input.collection,
      key: input.key,
      value: entry,
    });

  return maybeMap(handleEntry, input.store.get(input.key, input.collection));
};

type CacheSetInput = {
  store: BaseKVStore;
  collection: string | undefined;
  key: string;
  value: Blob;
  ttlMs?: number;
  context?: AdapterCallContext;
};

const cacheSet = (input: CacheSetInput) => {
  const diagnostics = validateStorageKey(input.key, "cache.set");
  if (diagnostics.length > 0) {
    reportDiagnostics(input.context, diagnostics);
    return false;
  }
  const entry = toEnvelope(input.value, input.ttlMs);
  return maybeMap(toTrue, input.store.put(input.key, entry, input.collection));
};

type CacheDeleteInput = {
  store: BaseKVStore;
  collection: string | undefined;
  key: string;
  context?: AdapterCallContext;
};

const cacheDelete = (input: CacheDeleteInput) => {
  const diagnostics = validateStorageKey(input.key, "cache.delete");
  if (diagnostics.length > 0) {
    reportDiagnostics(input.context, diagnostics);
    return false;
  }
  return maybeMap(toBoolean, input.store.delete(input.key, input.collection));
};

type CacheStoreInput = {
  store: BaseKVStore;
  collection: string | undefined;
};

const cacheGetArgs = (
  input: CacheStoreInput,
  ...args: [key: string, context?: AdapterCallContext]
) =>
  cacheGet({
    store: input.store,
    collection: input.collection,
    key: args[0],
    context: args[1],
  });

const cacheSetArgs = (
  input: CacheStoreInput,
  ...args: [key: string, value: Blob, ttlMs?: number, context?: AdapterCallContext]
) =>
  cacheSet({
    store: input.store,
    collection: input.collection,
    key: args[0],
    value: args[1],
    ttlMs: args[2],
    context: args[3],
  });

const cacheDeleteArgs = (
  input: CacheStoreInput,
  ...args: [key: string, context?: AdapterCallContext]
) =>
  cacheDelete({
    store: input.store,
    collection: input.collection,
    key: args[0],
    context: args[1],
  });

export function fromLlamaIndexKVStoreCache(
  store: BaseKVStore,
  options?: LlamaIndexCacheOptions,
): Cache {
  const collection = options?.collection;

  return {
    get: bindFirst(cacheGetArgs, { store, collection }),
    set: bindFirst(cacheSetArgs, { store, collection }),
    delete: bindFirst(cacheDeleteArgs, { store, collection }),
  };
}
