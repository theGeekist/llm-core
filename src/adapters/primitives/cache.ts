import type { AdapterCallContext, Blob, Cache, KVStore } from "../types";
import { reportDiagnostics, validateStorageKey } from "../input-validation";
import { mapMaybe } from "../../maybe";
import { readNumber } from "../utils";

type CacheEntry = {
  value: Blob;
  expiresAt?: number;
};

const toUndefined = () => undefined;
const CACHE_EXPIRY_KEY = "__cacheExpiresAt";

const toExpiresAt = (ttlMs?: number) =>
  typeof ttlMs === "number" ? Date.now() + ttlMs : undefined;

const readExpiresAt = (value: Blob | undefined) => readNumber(value?.metadata?.[CACHE_EXPIRY_KEY]);

const isBlobExpired = (value: Blob | undefined) => {
  const expiresAt = readExpiresAt(value);
  return typeof expiresAt === "number" && Date.now() > expiresAt;
};

const withBlobExpiry = (value: Blob, ttlMs?: number): Blob => {
  const expiresAt = toExpiresAt(ttlMs);
  if (expiresAt === undefined) {
    return value;
  }
  return {
    ...value,
    metadata: {
      ...(value.metadata ?? {}),
      [CACHE_EXPIRY_KEY]: expiresAt,
    },
  };
};

const stripExpiryMetadata = (value: Blob): Blob => {
  const metadata = value.metadata;
  if (!metadata || !(CACHE_EXPIRY_KEY in metadata)) {
    return value;
  }
  const rest = { ...metadata };
  delete rest[CACHE_EXPIRY_KEY];
  const nextMetadata = Object.keys(rest).length > 0 ? rest : undefined;
  return { ...value, metadata: nextMetadata };
};

const readFirst = <T>(entries: Array<T | undefined>) => entries[0];

const deleteKvEntry = (store: KVStore<Blob>, key: string, context?: AdapterCallContext) =>
  mapMaybe(store.mdelete([key], context), toUndefined);

const readKvEntry = (
  store: KVStore<Blob>,
  key: string,
  value: Blob | undefined,
  context?: AdapterCallContext,
) => {
  if (!value) {
    return undefined;
  }
  if (isBlobExpired(value)) {
    return mapMaybe(deleteKvEntry(store, key, context), toUndefined);
  }
  return stripExpiryMetadata(value);
};

const readKvEntries = (
  store: KVStore<Blob>,
  key: string,
  context: AdapterCallContext | undefined,
  entries: Array<Blob | undefined>,
) => readKvEntry(store, key, readFirst(entries), context);

export const createMemoryCache = (): Cache => {
  const store = new Map<string, CacheEntry>();

  const isExpired = (entry: CacheEntry) => {
    return typeof entry.expiresAt === "number" && Date.now() > entry.expiresAt;
  };

  const get = (key: string, context?: AdapterCallContext) => {
    const diagnostics = validateStorageKey(key, "cache.get");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return undefined;
    }

    const entry = store.get(key);
    if (!entry) {
      return undefined;
    }

    if (isExpired(entry)) {
      store.delete(key);
      return undefined;
    }

    return entry.value;
  };

  const set = (key: string, value: Blob, ttlMs?: number, context?: AdapterCallContext) => {
    const diagnostics = validateStorageKey(key, "cache.set");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return;
    }

    const expiresAt = typeof ttlMs === "number" ? Date.now() + ttlMs : undefined;
    store.set(key, { value, expiresAt });
  };

  const del = (key: string, context?: AdapterCallContext) => {
    const diagnostics = validateStorageKey(key, "cache.delete");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return;
    }
    store.delete(key);
  };

  return { get, set, delete: del };
};

export const createCacheFromKVStore = (store: KVStore<Blob>): Cache => {
  const get = (key: string, context?: AdapterCallContext) => {
    const readEntries = (entries: Array<Blob | undefined>) =>
      readKvEntries(store, key, context, entries);

    return mapMaybe(store.mget([key], context), readEntries);
  };

  const set = (key: string, value: Blob, ttlMs?: number, context?: AdapterCallContext) => {
    const entry = withBlobExpiry(value, ttlMs);
    return mapMaybe(store.mset([[key, entry]], context), toUndefined);
  };

  const del = (key: string, context?: AdapterCallContext) =>
    mapMaybe(store.mdelete([key], context), toUndefined);

  return { get, set, delete: del };
};
