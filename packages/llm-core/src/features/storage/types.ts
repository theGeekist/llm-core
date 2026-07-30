import type { InvocationContext, JsonValue, MediaType, ResourceRef } from "#contracts";
import type { MaybePromise } from "#shared/maybe";

export type StorageMutationResult = boolean | null;

export type StorageValue =
  | {
      readonly kind: "json";
      readonly value: JsonValue;
    }
  | {
      readonly kind: "resource";
      readonly resource: ResourceRef;
    };

export interface CacheRecord {
  readonly value: StorageValue;
  readonly expiresAt?: string;
}

export interface LiveResourceWrite {
  readonly bytes: Uint8Array;
  readonly mediaType: MediaType;
}

export interface ResourceStore {
  read(input: ResourceStoreReadInput): MaybePromise<Uint8Array | null>;
  write(input: ResourceStoreWriteInput): MaybePromise<ResourceRef | null>;
  delete(input: ResourceStoreDeleteInput): MaybePromise<StorageMutationResult>;
}

export interface ResourceStoreReadInput {
  readonly context: InvocationContext;
  readonly resource: ResourceRef;
}

export interface ResourceStoreWriteInput {
  readonly context: InvocationContext;
  readonly resource: LiveResourceWrite;
}

export interface ResourceStoreDeleteInput {
  readonly context: InvocationContext;
  readonly resource: ResourceRef;
}

export interface KeyValueStore {
  list(input: KeyValueStoreListInput): MaybePromise<string[]>;
  getMany(input: KeyValueStoreGetManyInput): MaybePromise<Array<StorageValue | null>>;
  setMany(input: KeyValueStoreSetManyInput): MaybePromise<StorageMutationResult>;
  deleteMany(input: KeyValueStoreDeleteManyInput): MaybePromise<StorageMutationResult>;
}

export interface KeyValueStoreListInput {
  readonly context: InvocationContext;
  readonly prefix?: string;
}

export interface KeyValueStoreGetManyInput {
  readonly context: InvocationContext;
  readonly keys: readonly string[];
}

export interface KeyValueStoreSetManyInput {
  readonly context: InvocationContext;
  readonly entries: ReadonlyArray<readonly [string, StorageValue]>;
}

export interface KeyValueStoreDeleteManyInput {
  readonly context: InvocationContext;
  readonly keys: readonly string[];
}

export interface CacheStore {
  get(input: CacheStoreGetInput): MaybePromise<StorageValue | null>;
  set(input: CacheStoreSetInput): MaybePromise<StorageMutationResult>;
  delete(input: CacheStoreDeleteInput): MaybePromise<StorageMutationResult>;
}

export interface CacheStoreGetInput {
  readonly context: InvocationContext;
  readonly key: string;
}

export interface CacheStoreSetInput {
  readonly context: InvocationContext;
  readonly key: string;
  readonly value: StorageValue;
  readonly ttlMs?: number;
}

export interface CacheStoreDeleteInput {
  readonly context: InvocationContext;
  readonly key: string;
}
