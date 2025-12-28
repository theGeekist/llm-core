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

const cacheGet = (store: BaseStore<string, unknown>, key: string, context?: AdapterCallContext) => {
  const diagnostics = validateStorageKey(key, "cache.get");
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return null;
  }

  const handleEntries = (values: unknown[]) => readEntry(store, key, values[0]);

  return maybeMap(handleEntries, store.mget([key]));
};

const cacheSet = (
  store: BaseStore<string, unknown>,
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
  return maybeMap(toTrue, store.mset([[key, entry]]));
};

const cacheDelete = (
  store: BaseStore<string, unknown>,
  key: string,
  context?: AdapterCallContext,
) => {
  const diagnostics = validateStorageKey(key, "cache.delete");
  if (diagnostics.length > 0) {
    reportDiagnostics(context, diagnostics);
    return false;
  }
  return maybeMap(toBoolean, store.mdelete([key]));
};

export function fromLangChainStoreCache(store: BaseStore<string, unknown>): Cache {
  return {
    get: bindFirst(cacheGet, store),
    set: bindFirst(cacheSet, store),
    delete: bindFirst(cacheDelete, store),
  };
}
