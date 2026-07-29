import type { InvocationContext, JsonObject, NativeExtensions, SchemaRef } from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type { Document } from "../retrieval/public";

export interface IndexingOptions {
  batchSize?: number;
  cleanup?: "full" | "incremental";
  sourceIdKey?: string;
  cleanupBatchSize?: number;
  forceUpdate?: boolean;
}

export interface IndexingRequest {
  documents: Document[];
  options?: IndexingOptions;
}

export interface IndexingResult {
  added: number;
  deleted: number;
  updated: number;
  skipped: number;
}

export interface Indexer {
  index(request: IndexingRequest, context: InvocationContext): MaybePromise<IndexingResult>;
}

export interface VectorRecord {
  id?: string;
  values: number[];
  metadata?: JsonObject;
  document?: Document;
}

export type VectorStoreUpsertRequest =
  | { documents: Document[]; namespace?: string }
  | { vectors: VectorRecord[]; namespace?: string };

export type VectorStoreDeleteRequest =
  | { ids: string[]; namespace?: string }
  | { filter: JsonObject; namespace?: string };

export interface VectorStoreInfo {
  dimension?: number;
  metadataSchema?: SchemaRef;
  filterSchema?: SchemaRef;
  namespace?: string;
  extensions?: NativeExtensions;
}

export interface VectorStoreUpsertResult {
  ids?: string[];
}

export interface VectorStore {
  readonly info?: VectorStoreInfo;
  upsert(
    request: VectorStoreUpsertRequest,
    context: InvocationContext,
  ): MaybePromise<VectorStoreUpsertResult | null>;
  delete(
    request: VectorStoreDeleteRequest,
    context: InvocationContext,
  ): MaybePromise<boolean | null>;
}
