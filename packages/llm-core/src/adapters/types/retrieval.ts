import type { AdapterMetadata, AdapterRequest } from "./core";
import type { Document } from "./documents";
import type { MessageContent } from "./messages";
import type { MaybePromise } from "#shared/maybe";

export type RetrievalQuery = string | MessageContent;

export type RetrievalResult = {
  query?: RetrievalQuery;
  documents: Document[];
  citations?: Array<{ id?: string; text?: string; source?: string }>;
};

export type TextSplitter = {
  split(request: AdapterRequest<{ text: string }>): MaybePromise<string[]>;
  splitBatch?(request: AdapterRequest<{ texts: string[] }>): MaybePromise<string[][]>;
  splitWithMetadata?(
    request: AdapterRequest<{ text: string }>,
  ): MaybePromise<Array<{ text: string; metadata?: AdapterMetadata }>>;
  metadata?: AdapterMetadata;
};

export type Embedder = {
  embed(request: AdapterRequest<{ text: string }>): MaybePromise<number[]>;
  embedMany?(request: AdapterRequest<{ texts: string[] }>): MaybePromise<number[][]>;
  metadata?: AdapterMetadata;
};

export type Retriever = {
  retrieve(request: AdapterRequest<{ query: RetrievalQuery }>): MaybePromise<RetrievalResult>;
  metadata?: AdapterMetadata;
};

export type Reranker = {
  rerank(
    request: AdapterRequest<{
      query: RetrievalQuery;
      documents: Document[];
    }>,
  ): MaybePromise<Document[]>;
  metadata?: AdapterMetadata;
};

export type DocumentLoader = {
  load(request: AdapterRequest): MaybePromise<Document[]>;
  metadata?: AdapterMetadata;
};

export type DocumentTransformer = {
  transform(request: AdapterRequest<{ documents: Document[] }>): MaybePromise<Document[]>;
  metadata?: AdapterMetadata;
};

export type StructuredQueryOperator = "and" | "or" | "not";
export type StructuredQueryComparator = "eq" | "ne" | "lt" | "gt" | "lte" | "gte";
export type StructuredQueryValue = string | number | boolean;

export type StructuredQueryComparison = {
  type: "comparison";
  comparator: StructuredQueryComparator;
  attribute: string;
  value: StructuredQueryValue;
};

export type StructuredQueryOperation = {
  type: "operation";
  operator: StructuredQueryOperator;
  args?: StructuredQueryFilter[] | null;
};

export type StructuredQueryFilter = StructuredQueryComparison | StructuredQueryOperation;

export type StructuredQuery = {
  query: string;
  filter?: StructuredQueryFilter | null;
};
