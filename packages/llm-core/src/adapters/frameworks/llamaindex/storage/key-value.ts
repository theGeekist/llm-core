import { isJsonValue, type JsonValue } from "#contracts";
import { maybeAll, maybeMap } from "#shared/maybe";
import {
  assertStorageKeys,
  jsonStorageValue,
  type KeyValueStore,
} from "../../../../features/storage/public";
import type { LlamaIndexDocumentStore } from "./types";

const readDocument = (document: { toJSON(): unknown } | null | undefined) => {
  if (!document) {
    return null;
  }
  const value = document.toJSON();
  return isJsonValue(value) ? jsonStorageValue(value) : null;
};

export const createLlamaIndexKeyValueStore = (store: LlamaIndexDocumentStore): KeyValueStore => {
  const adapter: KeyValueStore = {
    list: (_context, prefix) =>
      maybeMap(
        (documents) =>
          Object.keys(documents).filter((key) => prefix === undefined || key.startsWith(prefix)),
        store.docs(),
      ),
    getMany: (_context, keys) => {
      assertStorageKeys(keys);
      return maybeMap(
        (documents) => documents.map(readDocument),
        maybeAll(keys.map((key) => store.getDocument(key, false))),
      );
    },
    setMany: (_context, entries) => {
      if (entries.length === 0) {
        throw new TypeError("Storage entry collections must be non-empty.");
      }
      const documents: Array<Record<string, JsonValue>> = entries.map(([key, entry]) => {
        assertStorageKeys([key]);
        if (entry.kind !== "json" || !isJsonValue(entry.value) || Array.isArray(entry.value)) {
          throw new TypeError("LlamaIndex document stores accept JSON object values only.");
        }
        if (typeof entry.value !== "object" || entry.value === null) {
          throw new TypeError("LlamaIndex document stores accept JSON object values only.");
        }
        return { ...entry.value, id_: key };
      });
      return maybeMap(() => true, store.addDocuments(documents, true));
    },
    deleteMany: (_context, keys) => {
      assertStorageKeys(keys);
      return maybeMap(() => true, maybeAll(keys.map((key) => store.deleteDocument(key, false))));
    },
  };
  return Object.freeze(adapter);
};
