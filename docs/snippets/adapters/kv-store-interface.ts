// #region docs
import type { AdapterRequest } from "@geekist/llm-core/adapters";
import type { MaybePromise } from "@geekist/llm-core/functional";

export type KVStore<V = unknown> = {
  list(request: AdapterRequest<{ prefix?: string }>): MaybePromise<string[]>;
  mget(request: AdapterRequest<{ keys: string[] }>): MaybePromise<Array<V | null>>;
  mset(request: AdapterRequest<{ pairs: Array<[string, V]> }>): MaybePromise<boolean | null>;
  mdelete(request: AdapterRequest<{ keys: string[] }>): MaybePromise<boolean | null>;
};
// #endregion docs
