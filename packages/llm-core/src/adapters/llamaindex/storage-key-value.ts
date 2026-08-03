import type { BaseDocumentStore } from "@llamaindex/core/storage/doc-store";
import type { BaseKVStore } from "@llamaindex/core/storage/kv-store";
import { Document as LlamaIndexDocument, type BaseNode } from "@llamaindex/core/schema";
import { maybeAll, maybeMap } from "#shared/maybe";
import {
  assertStorageKey,
  assertStorageKeys,
  registerStorageValue,
  type KeyValueStore,
  type StorageValue,
} from "../../features/storage/public";

const ENVELOPE_KEY = "org.thegeekist.llm-core.storage-v2";

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const storageEnvelope = (value: StorageValue): Record<string, unknown> => ({
  [ENVELOPE_KEY]: {
    version: 2,
    value: registerStorageValue(value),
  },
});

const readStorageEnvelope = (value: unknown): StorageValue | null => {
  if (!isPlainRecord(value) || Object.keys(value).length !== 1) {
    return null;
  }
  const envelope = value[ENVELOPE_KEY];
  if (
    !isPlainRecord(envelope) ||
    Object.keys(envelope).length !== 2 ||
    envelope.version !== 2 ||
    !("value" in envelope)
  ) {
    return null;
  }
  try {
    return registerStorageValue(envelope.value);
  } catch {
    return null;
  }
};

export interface CreateLlamaIndexKeyValueStoreInput {
  readonly store: BaseKVStore;
  readonly collection?: string;
}

export const createLlamaIndexKeyValueStore = ({
  store,
  collection,
}: CreateLlamaIndexKeyValueStoreInput): KeyValueStore => {
  const adapter: KeyValueStore = {
    list: ({ prefix }) =>
      maybeMap(
        (values) =>
          Object.entries(values)
            .filter(([, value]) => readStorageEnvelope(value) !== null)
            .map(([key]) => key)
            .filter((key) => prefix === undefined || key.startsWith(prefix)),
        store.getAll(collection),
      ),
    getMany: ({ keys }) => {
      assertStorageKeys(keys);
      return maybeMap(
        (values) => values.map(readStorageEnvelope),
        maybeAll(keys.map((key) => store.get(key, collection))),
      );
    },
    setMany: ({ entries }) => {
      if (entries.length === 0) {
        throw new TypeError("Storage entry collections must be non-empty.");
      }
      const staged = entries.map(([key, value]) => {
        assertStorageKey(key);
        return [key, storageEnvelope(value)] as const;
      });
      const writes = staged.map(([key, value]) => store.put(key, value, collection));
      return maybeMap(() => true, maybeAll(writes));
    },
    deleteMany: ({ keys }) => {
      assertStorageKeys(keys);
      return maybeMap(
        (results) => results.every(Boolean),
        maybeAll(keys.map((key) => store.delete(key, collection))),
      );
    },
  };
  return Object.freeze(adapter);
};

const nodeEnvelope = (node: BaseNode | null | undefined): StorageValue | null =>
  node ? readStorageEnvelope(node.metadata) : null;

export const createLlamaIndexDocumentKeyValueStore = (store: BaseDocumentStore): KeyValueStore => {
  const adapter: KeyValueStore = {
    list: ({ prefix }) =>
      maybeMap(
        (documents) =>
          Object.entries(documents)
            .filter(([, node]) => nodeEnvelope(node) !== null)
            .map(([key]) => key)
            .filter((key) => prefix === undefined || key.startsWith(prefix)),
        store.docs(),
      ),
    getMany: ({ keys }) => {
      assertStorageKeys(keys);
      return maybeMap(
        (documents) => documents.map(nodeEnvelope),
        maybeAll(keys.map((key) => store.getDocument(key, false))),
      );
    },
    setMany: ({ entries }) => {
      if (entries.length === 0) {
        throw new TypeError("Storage entry collections must be non-empty.");
      }
      const documents = entries.map(([key, value]) => {
        assertStorageKey(key);
        return new LlamaIndexDocument({
          id_: key,
          text: "",
          metadata: storageEnvelope(value),
        });
      });
      return maybeMap(() => true, store.addDocuments(documents, true));
    },
    deleteMany: ({ keys }) => {
      assertStorageKeys(keys);
      return maybeMap(() => true, maybeAll(keys.map((key) => store.deleteDocument(key, false))));
    },
  };
  return Object.freeze(adapter);
};
