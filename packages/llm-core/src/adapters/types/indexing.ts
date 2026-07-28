import type { AdapterMetadata, AdapterRequest } from "./core";
import type { Document } from "./documents";
import type { DocumentLoader } from "./retrieval";
import type { MaybePromise } from "#shared/maybe";

export type IndexingOptions = {
  batchSize?: number;
  cleanup?: "full" | "incremental";
  sourceIdKey?: string;
  cleanupBatchSize?: number;
  forceUpdate?: boolean;
};

export type IndexingInput = {
  documents?: Document[];
  loader?: DocumentLoader;
  options?: IndexingOptions;
};

export type IndexingResult = {
  added: number;
  deleted: number;
  updated: number;
  skipped: number;
};

export type Indexing = {
  index(request: AdapterRequest<IndexingInput>): MaybePromise<IndexingResult>;
  metadata?: AdapterMetadata;
};
