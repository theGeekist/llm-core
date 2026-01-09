import type { AdapterCallContext, Blob, Cache, KVStore } from "../types";
import { reportDiagnostics, validateStorageKey } from "../input-validation";
import { toNull, toTrue } from "../../shared/fp";
import { maybeMap } from "../../shared/maybe";
import { readNumber } from "../utils";

type CacheEntry = {
  value: Blob;
  expiresAt?: number;
};

const CACHE_EXPIRY_KEY = "__cacheExpiresAt";

const toBoolean = (value: unknown): boolean | null => (value === null ? null : value !== false);

const toExpiresAt = (ttlMs?: number) =>
  typeof ttlMs === "number" ? Date.now() + ttlMs : undefined;

const readExpiresAt = (value: Blob | null | undefined) =>
  readNumber(value?.metadata?.[CACHE_EXPIRY_KEY]);

const isBlobExpired = (value: Blob | null | undefined) => {
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
  maybeMap(toBoolean, store.mdelete([key], context));

type ReadKvEntryInput = {
  store: KVStore<Blob>;
  key: string;
  value: Blob | null | undefined;
  context?: AdapterCallContext;
};

const readKvEntry = (input: ReadKvEntryInput) => {
  if (!input.value) {
    return null;
  }
  if (isBlobExpired(input.value)) {
    return maybeMap(toNull, deleteKvEntry(input.store, input.key, input.context));
  }
  return stripExpiryMetadata(input.value);
};

type ReadKvEntriesInput = {
  store: KVStore<Blob>;
  key: string;
  context: AdapterCallContext | undefined;
  entries: Array<Blob | null | undefined>;
};

const readKvEntries = (input: ReadKvEntriesInput) =>
  readKvEntry({
    store: input.store,
    key: input.key,
    value: readFirst(input.entries),
    context: input.context,
  });

export const createMemoryCache = (): Cache => {
  const store = new Map<string, CacheEntry>();

  const isExpired = (entry: CacheEntry) => {
    return typeof entry.expiresAt === "number" && Date.now() > entry.expiresAt;
  };

  const get = (key: string, context?: AdapterCallContext) => {
    const diagnostics = validateStorageKey(key, "cache.get");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return null;
    }

    const entry = store.get(key);
    if (!entry) {
      return null;
    }

    if (isExpired(entry)) {
      store.delete(key);
      return null;
    }

    return entry.value;
  };

  const set = (
    ...args: [key: string, value: Blob, ttlMs?: number, context?: AdapterCallContext]
  ) => {
    const key = args[0];
    const value = args[1];
    const ttlMs = args[2];
    const context = args[3];
    const diagnostics = validateStorageKey(key, "cache.set");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return false;
    }

    const expiresAt = typeof ttlMs === "number" ? Date.now() + ttlMs : undefined;
    return maybeMap(toTrue, store.set(key, { value, expiresAt }));
  };

  const del = (key: string, context?: AdapterCallContext) => {
    const diagnostics = validateStorageKey(key, "cache.delete");
    if (diagnostics.length > 0) {
      reportDiagnostics(context, diagnostics);
      return false;
    }
    return maybeMap(toTrue, store.delete(key));
  };

  return { get, set, delete: del };
};

export const createCacheFromKVStore = (store: KVStore<Blob>): Cache => {
  const get = (key: string, context?: AdapterCallContext) => {
    const readEntries = (entries: Array<Blob | null | undefined>) =>
      readKvEntries({
        store,
        key,
        context,
        entries,
      });

    return maybeMap(readEntries, store.mget([key], context));
  };

  const set = (
    ...args: [key: string, value: Blob, ttlMs?: number, context?: AdapterCallContext]
  ) => {
    const key = args[0];
    const value = args[1];
    const ttlMs = args[2];
    const context = args[3];
    const entry = withBlobExpiry(value, ttlMs);
    return maybeMap(toBoolean, store.mset([[key, entry]], context));
  };

  const del = (...args: [key: string, context?: AdapterCallContext]) =>
    maybeMap(toBoolean, store.mdelete([args[0]], args[1]));

  return { get, set, delete: del };
};
