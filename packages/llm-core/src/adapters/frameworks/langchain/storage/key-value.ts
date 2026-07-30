import { isStorageValue, registerStorageValue } from "../../../../features/storage/public";
import type { KeyValueStore, StorageValue } from "../../../../features/storage/public";
import { maybeMap } from "#shared/maybe";
import { assertStorageKeys } from "../../../../features/storage/public";
import type { LangChainBaseStore } from "./types";

const collectKeys = async (store: LangChainBaseStore<StorageValue>, prefix?: string) => {
  const keys: string[] = [];
  for await (const key of store.yieldKeys(prefix)) {
    keys.push(String(key));
  }
  return keys;
};

export const createLangChainKeyValueStore = (
  store: LangChainBaseStore<StorageValue>,
): KeyValueStore => {
  const adapter: KeyValueStore = {
    list: ({ prefix }) => collectKeys(store, prefix),
    getMany: ({ keys }) => {
      assertStorageKeys(keys);
      return maybeMap(
        (values) =>
          values.map((value) => (isStorageValue(value) ? registerStorageValue(value) : null)),
        store.mget([...keys]),
      );
    },
    setMany: ({ entries }) => {
      if (entries.length === 0) {
        throw new TypeError("Storage entry collections must be non-empty.");
      }
      const registered = entries.map(
        ([key, value]) =>
          [assertStorageKeys([key])[0] as string, registerStorageValue(value)] as const,
      );
      return maybeMap(() => true, store.mset(registered));
    },
    deleteMany: ({ keys }) => {
      assertStorageKeys(keys);
      return maybeMap(() => true, store.mdelete([...keys]));
    },
  };
  return Object.freeze(adapter);
};
