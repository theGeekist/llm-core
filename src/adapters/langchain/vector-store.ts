import { Document as LangChainDocument } from "@langchain/core/documents";
import type { VectorStoreInterface } from "@langchain/core/vectorstores";
import type {
  AdapterCallContext,
  VectorRecord,
  VectorStore,
  VectorStoreDeleteInput,
  VectorStoreUpsertInput,
} from "../types";
import { mapMaybe } from "../../maybe";
import {
  reportDiagnostics,
  validateVectorStoreDeleteInput,
  validateVectorStoreUpsertInput,
} from "../input-validation";
import { toLangChainDocument } from "./documents";

type VectorUpsertPayload = {
  kind: "documents" | "vectors";
  documents: LangChainDocument[];
  vectors?: number[][];
  options?: Record<string, unknown>;
};

type VectorDeletePayload = {
  options: Record<string, unknown>;
};

const toVectorDocument = (record: VectorRecord) => {
  if (record.document) {
    return toLangChainDocument(record.document);
  }
  return new LangChainDocument({
    pageContent: "",
    metadata: record.metadata ?? {},
    id: record.id,
  });
};

const buildNamespaceOptions = (namespace?: string) => (namespace ? { namespace } : undefined);

const toVoid = () => undefined;

const toUpsertResult = (ids: unknown) => ({
  ids: Array.isArray(ids) ? (ids as string[]) : undefined,
});

const toUpsertPayload = (input: VectorStoreUpsertInput): VectorUpsertPayload => {
  const options = buildNamespaceOptions(input.namespace);
  if ("documents" in input) {
    return {
      kind: "documents",
      documents: input.documents.map(toLangChainDocument),
      options,
    };
  }
  const documents = input.vectors.map(toVectorDocument);
  const vectors = input.vectors.map((record) => record.values);
  return {
    kind: "vectors",
    documents,
    vectors,
    options,
  };
};

const toDeletePayload = (input: VectorStoreDeleteInput): VectorDeletePayload => {
  if ("ids" in input) {
    return {
      options: {
        ids: input.ids,
        ...(input.namespace ? { namespace: input.namespace } : {}),
      },
    };
  }
  return {
    options: {
      filter: input.filter,
      ...(input.namespace ? { namespace: input.namespace } : {}),
    },
  };
};

export function fromLangChainVectorStore(store: VectorStoreInterface): VectorStore {
  const upsert = (input: VectorStoreUpsertInput, context?: AdapterCallContext) => {
    const diagnostics = validateVectorStoreUpsertInput(input);
    reportDiagnostics(context, diagnostics);
    const payload = toUpsertPayload(input);
    if (payload.kind === "documents") {
      return mapMaybe(store.addDocuments(payload.documents, payload.options), toUpsertResult);
    }
    return mapMaybe(
      store.addVectors(payload.vectors ?? [], payload.documents, payload.options),
      toUpsertResult,
    );
  };

  const remove = (input: VectorStoreDeleteInput, context?: AdapterCallContext) => {
    const diagnostics = validateVectorStoreDeleteInput(input);
    reportDiagnostics(context, diagnostics);
    const payload = toDeletePayload(input);
    return mapMaybe(store.delete(payload.options), toVoid);
  };

  return {
    upsert,
    delete: remove,
  };
}
