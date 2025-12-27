import type { AdapterCallContext, Blob, Cache } from "../types";
import { fromPromiseLike, mapMaybe, bindFirst } from "../../maybe";
import { reportDiagnostics, validateStorageKey } from "../input-validation";

export type AiSdkCacheStore<T = unknown> = {
  get(key: string): T | undefined | Promise<T | undefined>;
  set(key: string, entry: T): void | Promise<void>;
  delete(key: string): boolean | Promise<boolean>;
  clear(): void | Promise<void>;
  has(key: string): boolean | Promise<boolean>;
  size(): number | Promise<number>;
  keys(): string[] | Promise<string[]>;
  getDefaultTTL?(): number | undefined;
};

type CacheEnvelope = {
  value: Blob;
  expiresAt?: number;
};

type CacheEntry = {
  result: CacheEnvelope;
  timestamp: number;
  key: string;
};

const toUndefined = () => undefined;

const toEntry = (key: string, value: Blob, ttlMs?: number): CacheEntry => ({
  key,
  timestamp: Date.now(),
  result: {
    value,
    expiresAt: typeof ttlMs === "number" ? Date.now() + ttlMs : undefined,
  },
});

const readEnvelope = (entry: CacheEntry | undefined): CacheEnvelope | undefined => entry?.result;

const isExpired = (envelope: CacheEnvelope | undefined) =>
  typeof envelope?.expiresAt === "number" && Date.now() > envelope.expiresAt;

const readValue = (envelope: CacheEnvelope | undefined) => envelope?.value;

const deleteEntry = (store: AiSdkCacheStore<CacheEntry>, key: string) =>
  mapMaybe(fromPromiseLike(store.delete(key)), toUndefined);

const readEntry = (
  store: AiSdkCacheStore<CacheEntry>,
  key: string,
  entry: CacheEntry | undefined,
) => {
  const envelope = readEnvelope(entry);
  if (!envelope) {
    return undefined;
  }
  if (isExpired(envelope)) {
    return mapMaybe(deleteEntry(store, key), toUndefined);
  }
  return readValue(envelope);
};

export type AiSdkCacheOptions = {
  defaultTtlMs?: number;
};

const cacheGet = (
  store: AiSdkCacheStore<CacheEntry>,
  key: string,
  context?: AdapterCallContext,
) => {
  const diagnostics = validateStorageKey(key, "cache.get");
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return undefined;
  }

  const handleEntry = (entry: CacheEntry | undefined) => readEntry(store, key, entry);
  return mapMaybe(fromPromiseLike(store.get(key)), handleEntry);
};
const cacheSet = (
  store: AiSdkCacheStore<CacheEntry>,
  options: AiSdkCacheOptions | undefined,
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
  const ttl = ttlMs ?? options?.defaultTtlMs ?? store.getDefaultTTL?.();
  const entry = toEntry(key, value, ttl);
  return mapMaybe(fromPromiseLike(store.set(key, entry)), toUndefined);
};

const cacheDelete = (
  store: AiSdkCacheStore<CacheEntry>,
  key: string,
  context?: AdapterCallContext,
) => {
  const diagnostics = validateStorageKey(key, "cache.delete");
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return;
  }
  return mapMaybe(fromPromiseLike(store.delete(key)), toUndefined);
};

export function fromAiSdkCacheStore(
  store: AiSdkCacheStore<CacheEntry>,
  options?: AiSdkCacheOptions,
): Cache {
  return {
    get: bindFirst(cacheGet, store),
    set: bindFirst(bindFirst(cacheSet, store), options),
    delete: bindFirst(cacheDelete, store),
  };
}
