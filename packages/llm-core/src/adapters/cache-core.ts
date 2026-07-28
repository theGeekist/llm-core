import type { AdapterCallContext, Blob, Cache } from "./types";
import { reportDiagnostics, validateStorageKey } from "./input-validation";
import { maybeChain, maybeMap, type MaybePromise } from "#shared/maybe";
import { normalizeTriState } from "#shared/tri-state";

export type CacheRecord = {
  value: Blob;
  expiresAt?: number;
};

type CacheBackend<TRead, TStored> = {
  read(key: string, context?: AdapterCallContext): MaybePromise<TRead | null | undefined>;
  write(key: string, value: TStored, context?: AdapterCallContext): MaybePromise<unknown>;
  remove(key: string, context?: AdapterCallContext): MaybePromise<unknown>;
};

type CacheAdapterPolicy<TRead, TStored> = {
  backend: CacheBackend<TRead, TStored>;
  decode(value: TRead | null | undefined): CacheRecord | null;
  encode(key: string, value: Blob, ttlMs?: number): TStored;
  resolveTtl?(ttlMs?: number): number | undefined;
  validateKeys?: boolean;
  normalizeSetResult?(value: unknown): boolean | null;
  normalizeDeleteResult?(value: unknown): boolean | null;
};

const toTrue = () => true;
const toNull = () => null;

const validateKey = (
  key: string,
  operation: "cache.get" | "cache.set" | "cache.delete",
  context: AdapterCallContext | undefined,
) => {
  const diagnostics = validateStorageKey(key, operation);
  reportDiagnostics(context, diagnostics);
  return diagnostics.length === 0;
};

const isExpired = (record: CacheRecord) =>
  typeof record.expiresAt === "number" && Date.now() > record.expiresAt;

export const createCacheAdapter = <TRead, TStored>(
  policy: CacheAdapterPolicy<TRead, TStored>,
): Cache => {
  const shouldValidate = policy.validateKeys !== false;
  const normalizeSet = policy.normalizeSetResult ?? toTrue;
  const normalizeDelete = policy.normalizeDeleteResult ?? normalizeTriState;

  const get = ({ key, context }: Parameters<Cache["get"]>[0]) => {
    if (shouldValidate && !validateKey(key, "cache.get", context)) {
      return null;
    }

    const read = (stored: TRead | null | undefined) => {
      const record = policy.decode(stored);
      if (!record) {
        return null;
      }
      if (isExpired(record)) {
        return maybeMap(toNull, policy.backend.remove(key, context));
      }
      return record.value;
    };

    return maybeChain(read, policy.backend.read(key, context));
  };

  const set = ({ key, value, ttlMs, context }: Parameters<Cache["set"]>[0]) => {
    if (shouldValidate && !validateKey(key, "cache.set", context)) {
      return false;
    }

    const ttl = policy.resolveTtl?.(ttlMs) ?? ttlMs;
    return maybeMap(
      normalizeSet,
      policy.backend.write(key, policy.encode(key, value, ttl), context),
    );
  };

  const del = ({ key, context }: Parameters<Cache["delete"]>[0]) => {
    if (shouldValidate && !validateKey(key, "cache.delete", context)) {
      return false;
    }
    return maybeMap(normalizeDelete, policy.backend.remove(key, context));
  };

  return { get, set, delete: del };
};

export const createEnvelope = (value: Blob, ttlMs?: number): CacheRecord => ({
  value,
  expiresAt: typeof ttlMs === "number" ? Date.now() + ttlMs : undefined,
});

export const isBlob = (value: unknown): value is Blob =>
  typeof value === "object" && value !== null && value instanceof Object && "bytes" in value;

export const isCacheRecord = (value: unknown): value is CacheRecord =>
  typeof value === "object" && value !== null && "value" in value;

export const normalizeBooleanResult = normalizeTriState;
