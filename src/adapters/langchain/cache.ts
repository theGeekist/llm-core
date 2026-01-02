import type { BaseStore } from "@langchain/core/stores";
import type { AdapterCallContext, Blob, Cache } from "../types";
import { bindFirst, maybeMap, toNull, toTrue } from "../../maybe";
import { reportDiagnostics, validateStorageKey } from "../input-validation";

const isBlob = (value: unknown): value is Blob =>
  typeof value === "object" && value !== null && value instanceof Object && "bytes" in value;

type CacheEnvelope = {
  value: Blob;
  expiresAt?: number;
};

const isEnvelope = (value: unknown): value is CacheEnvelope =>
  typeof value === "object" && value !== null && "value" in value;

const readEnvelope = (value: unknown) => (isEnvelope(value) ? value : undefined);

const readBlob = (value: unknown) => (isBlob(value) ? value : undefined);

const toEnvelope = (value: Blob, ttlMs?: number): CacheEnvelope => ({
  value,
  expiresAt: typeof ttlMs === "number" ? Date.now() + ttlMs : undefined,
});

const toBoolean = (value: unknown): boolean | null => (value === null ? null : value !== false);

const isExpired = (envelope: CacheEnvelope | undefined) =>
  typeof envelope?.expiresAt === "number" && Date.now() > envelope.expiresAt;

const deleteEntry = (store: BaseStore<string, unknown>, key: string) =>
  maybeMap(toBoolean, store.mdelete([key]));

const readEntry = (store: BaseStore<string, unknown>, key: string, value: unknown) => {
  const envelope = readEnvelope(value);
  if (envelope) {
    if (isExpired(envelope)) {
      return maybeMap(toNull, deleteEntry(store, key));
    }
    return envelope.value;
  }
  return readBlob(value) ?? null;
};

type CacheGetInput = {
  store: BaseStore<string, unknown>;
  key: string;
  context?: AdapterCallContext;
};

const cacheGet = (input: CacheGetInput) => {
  const diagnostics = validateStorageKey(input.key, "cache.get");
  if (diagnostics.length > 0) {
    reportDiagnostics(input.context, diagnostics);
    return null;
  }

  const handleEntries = (values: unknown[]) => readEntry(input.store, input.key, values[0]);

  return maybeMap(handleEntries, input.store.mget([input.key]));
};

type CacheSetInput = {
  store: BaseStore<string, unknown>;
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
  return maybeMap(toTrue, input.store.mset([[input.key, entry]]));
};

type CacheDeleteInput = {
  store: BaseStore<string, unknown>;
  key: string;
  context?: AdapterCallContext;
};

const cacheDelete = (input: CacheDeleteInput) => {
  const diagnostics = validateStorageKey(input.key, "cache.delete");
  if (diagnostics.length > 0) {
    reportDiagnostics(input.context, diagnostics);
    return false;
  }
  return maybeMap(toBoolean, input.store.mdelete([input.key]));
};

const cacheGetArgs = (
  store: BaseStore<string, unknown>,
  ...args: [key: string, context?: AdapterCallContext]
) =>
  cacheGet({
    store,
    key: args[0],
    context: args[1],
  });

const cacheSetArgs = (
  store: BaseStore<string, unknown>,
  ...args: [key: string, value: Blob, ttlMs?: number, context?: AdapterCallContext]
) =>
  cacheSet({
    store,
    key: args[0],
    value: args[1],
    ttlMs: args[2],
    context: args[3],
  });

const cacheDeleteArgs = (
  store: BaseStore<string, unknown>,
  ...args: [key: string, context?: AdapterCallContext]
) =>
  cacheDelete({
    store,
    key: args[0],
    context: args[1],
  });

export function fromLangChainStoreCache(store: BaseStore<string, unknown>): Cache {
  return {
    get: bindFirst(cacheGetArgs, store),
    set: bindFirst(cacheSetArgs, store),
    delete: bindFirst(cacheDeleteArgs, store),
  };
}
