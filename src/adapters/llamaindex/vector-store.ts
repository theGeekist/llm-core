import { Document as LlamaDocument } from "@llamaindex/core/schema";
import type { BaseVectorStore } from "@llamaindex/core/vector-store";
import type {
  AdapterCallContext,
  VectorRecord,
  VectorStore,
  VectorStoreDeleteInput,
  VectorStoreUpsertInput,
} from "../types";
import { toTrue } from "#shared/fp";
import { maybeAll, maybeMap } from "#shared/maybe";
import {
  reportDiagnostics,
  validateVectorStoreDeleteInput,
  validateVectorStoreUpsertInput,
} from "../input-validation";
import { toLlamaIndexDocument } from "./documents";
import { warnDiagnostic } from "../utils";

type VectorUpsertPayload = {
  nodes: LlamaDocument[];
};

type VectorDeletePayload = {
  ids?: string[];
  filter?: Record<string, unknown>;
};

const toVectorDocument = (record: VectorRecord) => {
  if (record.document) {
    return toLlamaIndexDocument(record.document);
  }
  return new LlamaDocument({
    text: "",
    metadata: record.metadata,
    id_: record.id,
  });
};

const toEmbeddedNode = (record: VectorRecord) => {
  const node = toVectorDocument(record);
  node.embedding = record.values;
  return node;
};

const toUpsertPayload = (input: VectorStoreUpsertInput): VectorUpsertPayload => {
  if ("documents" in input) {
    return { nodes: input.documents.map(toLlamaIndexDocument) };
  }
  return { nodes: input.vectors.map(toEmbeddedNode) };
};

const toDeletePayload = (input: VectorStoreDeleteInput): VectorDeletePayload => {
  if ("ids" in input) {
    return { ids: input.ids };
  }
  return { filter: input.filter };
};

const toUpsertResult = (ids: string[]) => ({ ids });

const deleteVectorIds = (store: BaseVectorStore, ids: string[]) => {
  const tasks: Array<ReturnType<BaseVectorStore["delete"]>> = [];
  for (const id of ids) {
    tasks.push(store.delete(id));
  }
  return maybeAll(tasks);
};

const reportDeleteFilterUnsupported = (context?: AdapterCallContext) => {
  reportDiagnostics(context, [warnDiagnostic("vector_store_delete_filter_unsupported")]);
};

export function fromLlamaIndexVectorStore(store: BaseVectorStore): VectorStore {
  const upsert = (input: VectorStoreUpsertInput, context?: AdapterCallContext) => {
    const diagnostics = validateVectorStoreUpsertInput(input);
    reportDiagnostics(context, diagnostics);
    const payload = toUpsertPayload(input);
    return maybeMap(toUpsertResult, store.add(payload.nodes));
  };

  const remove = (input: VectorStoreDeleteInput, context?: AdapterCallContext) => {
    const diagnostics = validateVectorStoreDeleteInput(input);
    reportDiagnostics(context, diagnostics);
    if (diagnostics.length > 0) {
      return false;
    }
    const payload = toDeletePayload(input);
    if (payload.ids && payload.ids.length > 0) {
      return maybeMap(toTrue, deleteVectorIds(store, payload.ids));
    }
    if (payload.filter) {
      reportDeleteFilterUnsupported(context);
    }
    return null;
  };

  return {
    upsert,
    delete: remove,
  };
}
