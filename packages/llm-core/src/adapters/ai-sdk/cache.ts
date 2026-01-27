import type { AdapterCallContext, Blob, Cache } from "../types";
import { bindFirst, toNull, toTrue } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
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

const toBoolean = (value: unknown): boolean | null => (value === null ? null : value !== false);

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

const readValue = (envelope: CacheEnvelope) => envelope.value;

const deleteEntry = (store: AiSdkCacheStore<CacheEntry>, key: string) =>
  maybeMap(toBoolean, store.delete(key));

const readEntry = (
  store: AiSdkCacheStore<CacheEntry>,
  key: string,
  entry: CacheEntry | undefined,
) => {
  const envelope = readEnvelope(entry);
  if (!envelope) {
    return null;
  }
  if (isExpired(envelope)) {
    return maybeMap(toNull, deleteEntry(store, key));
  }
  return readValue(envelope);
};

export type AiSdkCacheOptions = {
  defaultTtlMs?: number;
};

type CacheGetInput = {
  store: AiSdkCacheStore<CacheEntry>;
  key: string;
  context?: AdapterCallContext;
};

const cacheGet = (input: CacheGetInput) => {
  const diagnostics = validateStorageKey(input.key, "cache.get");
  if (diagnostics.length > 0) {
    reportDiagnostics(input.context, diagnostics);
    return null;
  }

  const handleEntry = (entry: CacheEntry | undefined) => readEntry(input.store, input.key, entry);
  return maybeMap(handleEntry, input.store.get(input.key));
};

const cacheGetArgs = (
  store: AiSdkCacheStore<CacheEntry>,
  ...args: [key: string, context?: AdapterCallContext]
) =>
  cacheGet({
    store,
    key: args[0],
    context: args[1],
  });
type CacheSetInput = {
  store: AiSdkCacheStore<CacheEntry>;
  options: AiSdkCacheOptions | undefined;
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
  const ttl = input.ttlMs ?? input.options?.defaultTtlMs ?? input.store.getDefaultTTL?.();
  const entry = toEntry(input.key, input.value, ttl);
  return maybeMap(toTrue, input.store.set(input.key, entry));
};

type CacheDeleteInput = {
  store: AiSdkCacheStore<CacheEntry>;
  key: string;
  context?: AdapterCallContext;
};

const cacheDelete = (input: CacheDeleteInput) => {
  const diagnostics = validateStorageKey(input.key, "cache.delete");
  if (diagnostics.length > 0) {
    reportDiagnostics(input.context, diagnostics);
    return false;
  }
  return maybeMap(toBoolean, input.store.delete(input.key));
};

const cacheDeleteArgs = (
  store: AiSdkCacheStore<CacheEntry>,
  ...args: [key: string, context?: AdapterCallContext]
) =>
  cacheDelete({
    store,
    key: args[0],
    context: args[1],
  });

type CacheSetArgs = [key: string, value: Blob, ttlMs?: number, context?: AdapterCallContext];

const cacheSetWithOptions = (
  input: { store: AiSdkCacheStore<CacheEntry>; options?: AiSdkCacheOptions },
  ...args: CacheSetArgs
) =>
  cacheSet({
    store: input.store,
    options: input.options,
    key: args[0],
    value: args[1],
    ttlMs: args[2],
    context: args[3],
  });

export function fromAiSdkCacheStore(
  store: AiSdkCacheStore<CacheEntry>,
  options?: AiSdkCacheOptions,
): Cache {
  return {
    get: bindFirst(cacheGetArgs, store),
    set: bindFirst(cacheSetWithOptions, { store, options }),
    delete: bindFirst(cacheDeleteArgs, store),
  };
}
