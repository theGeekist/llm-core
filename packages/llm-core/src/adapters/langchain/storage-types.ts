import type { JsonObject } from "#contracts";
import type { MaybePromise } from "#shared/maybe";

export interface LangChainBaseStore<T> {
  mget(keys: string[]): MaybePromise<Array<T | undefined>>;
  mset(entries: ReadonlyArray<readonly [string, T]>): MaybePromise<void>;
  mdelete(keys: string[]): MaybePromise<void>;
  yieldKeys(prefix?: string): AsyncIterable<string>;
}

export interface LangChainMemory {
  loadMemoryVariables(input: JsonObject): MaybePromise<unknown>;
  saveContext(input: JsonObject, output: JsonObject): MaybePromise<void>;
}
