import type { BaseDocumentStore } from "@llamaindex/core/storage/doc-store";
import type { AdapterCallContext, KVStore } from "../types";
import { toTrue } from "#shared/fp";
import { maybeAll, maybeMap, type MaybePromise } from "#shared/maybe";
import { reportDiagnostics, validateKvKeys, validateKvPairs } from "../input-validation";

type DocumentShape = { id_?: string };
type DocumentResult = { toJSON: () => unknown } | undefined | null;

const asDocument = (value: Record<string, unknown>, key: string) => {
  const doc = value as DocumentShape;
  if (!doc.id_) {
    doc.id_ = key;
  }
  return doc as Record<string, unknown>;
};

export function fromLlamaIndexDocumentStore(store: BaseDocumentStore): KVStore {
  return {
    mget: (keys, context?: AdapterCallContext) => {
      const diagnostics = validateKvKeys(keys, "mget");
      if (diagnostics.length > 0) {
        reportDiagnostics(context, diagnostics);
        return [];
      }
      const results = keys.map(
        (key) => store.getDocument(key, false) as MaybePromise<DocumentResult>,
      );
      return maybeMap(
        (docs: DocumentResult[]) => docs.map((doc) => (doc ? doc.toJSON() : undefined)),
        maybeAll<DocumentResult>(results),
      );
    },
    mset: (pairs, context?: AdapterCallContext) => {
      const diagnostics = validateKvPairs(pairs);
      if (diagnostics.length > 0) {
        reportDiagnostics(context, diagnostics);
        return false;
      }
      const docs = pairs
        .filter(
          (pair): pair is [string, Record<string, unknown>] =>
            typeof pair[1] === "object" && !!pair[1],
        )
        .map(([key, value]) => asDocument(value, key));
      return maybeMap(toTrue, store.addDocuments(docs as never, true));
    },
    mdelete: (keys, context?: AdapterCallContext) => {
      const diagnostics = validateKvKeys(keys, "mdelete");
      if (diagnostics.length > 0) {
        reportDiagnostics(context, diagnostics);
        return false;
      }
      return maybeMap(toTrue, maybeAll(keys.map((key) => store.deleteDocument(key, false))));
    },
    list: () => maybeMap((docs) => Object.keys(docs), store.docs()),
  };
}
