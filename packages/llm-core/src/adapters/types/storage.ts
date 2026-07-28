import type { AdapterRequest } from "./core";
import type { MaybePromise } from "#shared/maybe";

export type Blob = {
  id?: string | null;
  contentType?: string | null;
  bytes: Uint8Array;
  metadata?: Record<string, unknown> | null;
};

export type KVStore<V = unknown> = {
  list(request: AdapterRequest<{ prefix?: string }>): MaybePromise<string[]>;
  mdelete(request: AdapterRequest<{ keys: string[] }>): MaybePromise<boolean | null>;
  mget(request: AdapterRequest<{ keys: string[] }>): MaybePromise<Array<V | null>>;
  mset(request: AdapterRequest<{ pairs: Array<[string, V]> }>): MaybePromise<boolean | null>;
};

export type Cache = {
  get(request: AdapterRequest<{ key: string }>): MaybePromise<Blob | null>;
  set(
    request: AdapterRequest<{ key: string; value: Blob; ttlMs?: number }>,
  ): MaybePromise<boolean | null>;
  delete(request: AdapterRequest<{ key: string }>): MaybePromise<boolean | null>;
};

export type Storage = {
  delete(request: AdapterRequest<{ key: string }>): MaybePromise<boolean | null>;
  get(request: AdapterRequest<{ key: string }>): MaybePromise<Blob | null>;
  list(request: AdapterRequest<{ prefix?: string }>): MaybePromise<string[]>;
  put(request: AdapterRequest<{ key: string; blob: Blob }>): MaybePromise<boolean | null>;
};
