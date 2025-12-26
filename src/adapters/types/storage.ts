import type { AdapterCallContext } from "./core";
import type { MaybePromise } from "../../maybe";

export type Blob = {
  id?: string;
  contentType?: string;
  bytes: Uint8Array;
  metadata?: Record<string, unknown>;
};

export type KVStore<V = unknown> = {
  list(prefix?: string, context?: AdapterCallContext): MaybePromise<string[]>;
  mdelete(keys: string[], context?: AdapterCallContext): MaybePromise<void>;
  mget(keys: string[], context?: AdapterCallContext): MaybePromise<Array<V | undefined>>;
  mset(pairs: Array<[string, V]>, context?: AdapterCallContext): MaybePromise<void>;
};

export type Cache = {
  get(key: string, context?: AdapterCallContext): MaybePromise<Blob | undefined>;
  set(key: string, value: Blob, ttlMs?: number, context?: AdapterCallContext): MaybePromise<void>;
  delete(key: string, context?: AdapterCallContext): MaybePromise<void>;
};

export type Storage = {
  delete(key: string, context?: AdapterCallContext): MaybePromise<void>;
  get(key: string, context?: AdapterCallContext): MaybePromise<Blob | undefined>;
  list(prefix?: string, context?: AdapterCallContext): MaybePromise<string[]>;
  put(key: string, blob: Blob, context?: AdapterCallContext): MaybePromise<void>;
};
