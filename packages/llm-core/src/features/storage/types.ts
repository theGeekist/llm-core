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
  read(context: InvocationContext, resource: ResourceRef): MaybePromise<Uint8Array | null>;
  write(context: InvocationContext, input: LiveResourceWrite): MaybePromise<ResourceRef | null>;
  delete(context: InvocationContext, resource: ResourceRef): MaybePromise<StorageMutationResult>;
}

export interface KeyValueStore {
  list(context: InvocationContext, prefix?: string): MaybePromise<string[]>;
  getMany(
    context: InvocationContext,
    keys: readonly string[],
  ): MaybePromise<Array<StorageValue | null>>;
  setMany(
    context: InvocationContext,
    entries: ReadonlyArray<readonly [string, StorageValue]>,
  ): MaybePromise<StorageMutationResult>;
  deleteMany(
    context: InvocationContext,
    keys: readonly string[],
  ): MaybePromise<StorageMutationResult>;
}

export interface CacheStore {
  get(context: InvocationContext, key: string): MaybePromise<StorageValue | null>;
  set(
    context: InvocationContext,
    input: {
      readonly key: string;
      readonly value: StorageValue;
      readonly ttlMs?: number;
    },
  ): MaybePromise<StorageMutationResult>;
  delete(context: InvocationContext, key: string): MaybePromise<StorageMutationResult>;
}
