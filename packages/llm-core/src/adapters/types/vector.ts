import type { AdapterMetadata, AdapterRequest } from "./core";
import type { Document } from "./documents";
import type { MaybePromise } from "#shared/maybe";

export type VectorRecord = {
  id?: string;
  values: number[];
  metadata?: AdapterMetadata;
  document?: Document;
};

export type VectorStoreUpsertInput =
  | { documents: Document[]; namespace?: string }
  | { vectors: VectorRecord[]; namespace?: string };

export type VectorStoreDeleteInput =
  | { ids: string[]; namespace?: string }
  | { filter: Record<string, unknown>; namespace?: string };

export type VectorStoreInfo = {
  dimension?: number;
  metadataSchema?: Record<string, unknown>;
  filterSchema?: Record<string, unknown>;
  namespace?: string;
};

export type VectorStoreUpsertResult = {
  ids?: string[];
};

export type VectorStore = {
  upsert(
    request: AdapterRequest<VectorStoreUpsertInput>,
  ): MaybePromise<VectorStoreUpsertResult | null>;
  delete(request: AdapterRequest<VectorStoreDeleteInput>): MaybePromise<boolean | null>;
  info?: VectorStoreInfo;
  metadata?: AdapterMetadata;
};
