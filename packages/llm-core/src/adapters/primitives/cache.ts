import type { Blob, Cache, KVStore } from "../types";
import {
  createCacheAdapter,
  createEnvelope,
  normalizeBooleanResult,
  type CacheRecord,
} from "../cache-core";
import { readNumber } from "../utils";

const CACHE_EXPIRY_KEY = "__cacheExpiresAt";

const readExpiresAt = (value: Blob | null | undefined) =>
  readNumber(value?.metadata?.[CACHE_EXPIRY_KEY]);

const withBlobExpiry = (value: Blob, ttlMs?: number): Blob => {
  const expiresAt = createEnvelope(value, ttlMs).expiresAt;
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

export const createMemoryCache = (): Cache => {
  const store = new Map<string, ReturnType<typeof createEnvelope>>();
  return createCacheAdapter<CacheRecord, CacheRecord>({
    backend: {
      read: (key) => store.get(key),
      write: (key, entry) => store.set(key, entry),
      remove: (key) => store.delete(key),
    },
    decode: (entry) => entry ?? null,
    encode: (_key, value, ttlMs) => createEnvelope(value, ttlMs),
    normalizeDeleteResult: () => true,
  });
};

export const createCacheFromKVStore = (store: KVStore<Blob>): Cache =>
  createCacheAdapter<Array<Blob | null>, Blob>({
    backend: {
      read: (key, context) => store.mget([key], context),
      write: (key, entry, context) => store.mset([[key, entry]], context),
      remove: (key, context) => store.mdelete([key], context),
    },
    decode: (entries) => {
      const value = Array.isArray(entries) ? entries[0] : entries;
      return value
        ? {
            value: stripExpiryMetadata(value),
            expiresAt: readExpiresAt(value) ?? undefined,
          }
        : null;
    },
    encode: (_key, value, ttlMs) => withBlobExpiry(value, ttlMs),
    validateKeys: false,
    normalizeSetResult: normalizeBooleanResult,
  });
