import type { InvocationContext } from "#contracts";
import { maybeChain, maybeMap, type MaybePromise } from "#shared/maybe";
import { normalizeTriState } from "#shared/tri-state";
import type { CacheRecord, CacheStore, StorageMutationResult, StorageValue } from "./types";
import {
  assertStorageKey,
  isCacheRecord,
  registerCacheRecord,
  registerStorageValue,
} from "./validation";

export interface CacheBackend<TRead, TStored> {
  read(context: InvocationContext, key: string): MaybePromise<TRead | null | undefined>;
  write(
    context: InvocationContext,
    input: { readonly key: string; readonly value: TStored },
  ): MaybePromise<unknown>;
  remove(context: InvocationContext, key: string): MaybePromise<unknown>;
}

export interface CacheAdapterPolicy<TRead, TStored> {
  readonly backend: CacheBackend<TRead, TStored>;
  readonly decode: (value: TRead | null | undefined) => CacheRecord | null;
  readonly encode: (key: string, value: StorageValue, ttlMs?: number) => TStored;
  readonly now?: () => number;
  readonly resolveTtl?: (ttlMs?: number) => number | undefined;
  readonly normalizeSetResult?: (value: unknown) => StorageMutationResult;
  readonly normalizeDeleteResult?: (value: unknown) => StorageMutationResult;
}

const trueResult = () => true;
const nullValue = () => null;

export const createCacheRecord = (
  value: StorageValue,
  ttlMs?: number,
  now: () => number = Date.now,
): CacheRecord =>
  registerCacheRecord({
    value: registerStorageValue(value),
    ...(ttlMs === undefined ? {} : { expiresAt: new Date(now() + ttlMs).toISOString() }),
  });

export const createCacheStoreAdapter = <TRead, TStored>(
  policy: CacheAdapterPolicy<TRead, TStored>,
): CacheStore => {
  const now = policy.now ?? Date.now;
  const normalizeSet = policy.normalizeSetResult ?? trueResult;
  const normalizeDelete = policy.normalizeDeleteResult ?? normalizeTriState;

  const get = (context: InvocationContext, key: string) => {
    assertStorageKey(key);
    return maybeChain(
      (stored: TRead | null | undefined) => {
        const record = policy.decode(stored);
        if (!record || !isCacheRecord(record)) {
          return null;
        }
        if (record.expiresAt && now() > Date.parse(record.expiresAt)) {
          return maybeMap(nullValue, policy.backend.remove(context, key));
        }
        return registerStorageValue(record.value);
      },
      policy.backend.read(context, key),
    );
  };

  const set = (
    context: InvocationContext,
    input: { readonly key: string; readonly value: StorageValue; readonly ttlMs?: number },
  ) => {
    const { key, value, ttlMs } = input;
    assertStorageKey(key);
    if (ttlMs !== undefined && (!Number.isSafeInteger(ttlMs) || ttlMs < 0)) {
      throw new TypeError("Cache TTL values must be non-negative safe integers.");
    }
    const resolvedTtl = policy.resolveTtl?.(ttlMs) ?? ttlMs;
    return maybeMap(
      normalizeSet,
      policy.backend.write(context, {
        key,
        value: policy.encode(key, registerStorageValue(value), resolvedTtl),
      }),
    );
  };

  const del = (context: InvocationContext, key: string) => {
    assertStorageKey(key);
    return maybeMap(normalizeDelete, policy.backend.remove(context, key));
  };

  return Object.freeze({ get, set, delete: del });
};
