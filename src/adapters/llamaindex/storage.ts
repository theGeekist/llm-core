import type { BaseDocumentStore } from "@llamaindex/core/storage/doc-store";
import type { AdapterKVStore } from "../types";
import { mapMaybe } from "../maybe";

type DocumentShape = { id_?: string };

const asDocument = (value: Record<string, unknown>, key: string) => {
  const doc = value as DocumentShape;
  if (!doc.id_) {
    doc.id_ = key;
  }
  return doc as Record<string, unknown>;
};

export function fromLlamaIndexDocumentStore(store: BaseDocumentStore): AdapterKVStore {
  return {
    mget: (keys) =>
      mapMaybe(Promise.all(keys.map((key) => store.getDocument(key, false))), (docs) =>
        docs.map((doc) => (doc ? doc.toJSON() : undefined)),
      ),
    mset: (pairs) => {
      const docs = pairs
        .filter(
          (pair): pair is [string, Record<string, unknown>] =>
            typeof pair[1] === "object" && !!pair[1],
        )
        .map(([key, value]) => asDocument(value, key));
      return store.addDocuments(docs as never, true);
    },
    mdelete: (keys) =>
      mapMaybe(Promise.all(keys.map((key) => store.deleteDocument(key, false))), () => undefined),
    list: () => mapMaybe(store.docs(), (docs) => Object.keys(docs)),
  };
}
