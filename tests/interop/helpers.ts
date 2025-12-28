import { maybeMap, maybeMapArray as adapterMapMaybeArray } from "#adapters";
import type { MaybePromise } from "#adapters";

export { maybeMap };

export const maybeMapArray = <T, R>(map: (value: T) => R, value: MaybePromise<T[]>) =>
  adapterMapMaybeArray(map, value);

export const asLangChainVectorStore = (store: unknown) =>
  store as import("@langchain/core/vectorstores").VectorStoreInterface;

export const asLlamaIndexVectorStore = (store: unknown) =>
  store as import("@llamaindex/core/vector-store").BaseVectorStore;
