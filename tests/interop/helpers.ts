import { mapMaybe, mapMaybeArray as adapterMapMaybeArray } from "#adapters";
import type { MaybePromise } from "#adapters";

export { mapMaybe };

export const mapMaybeArray = <T, R>(value: MaybePromise<T[]>, map: (value: T) => R) =>
  adapterMapMaybeArray(value, map);

export const asLangChainVectorStore = (store: unknown) =>
  store as import("@langchain/core/vectorstores").VectorStoreInterface;

export const asLlamaIndexVectorStore = (store: unknown) =>
  store as import("@llamaindex/core/vector-store").BaseVectorStore;
