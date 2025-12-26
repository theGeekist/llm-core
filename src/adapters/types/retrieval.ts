import type { AdapterCallContext, AdapterMetadata } from "./core";
import type { Document } from "./documents";
import type { MessageContent } from "./messages";
import type { MaybePromise } from "../../maybe";

export type RetrievalQuery = string | MessageContent;

export type RetrievalResult = {
  query?: RetrievalQuery;
  documents: Document[];
  citations?: Array<{ id?: string; text?: string; source?: string }>;
};

export type TextSplitter = {
  split(text: string, context?: AdapterCallContext): MaybePromise<string[]>;
  splitBatch?(texts: string[], context?: AdapterCallContext): MaybePromise<string[][]>;
  splitWithMetadata?(
    text: string,
    context?: AdapterCallContext,
  ): MaybePromise<Array<{ text: string; metadata?: AdapterMetadata }>>;
  metadata?: AdapterMetadata;
};

export type Embedder = {
  embed(text: string, context?: AdapterCallContext): MaybePromise<number[]>;
  embedMany?(texts: string[], context?: AdapterCallContext): MaybePromise<number[][]>;
  metadata?: AdapterMetadata;
};

export type Retriever = {
  retrieve(query: RetrievalQuery, context?: AdapterCallContext): MaybePromise<RetrievalResult>;
  metadata?: AdapterMetadata;
};

export type Reranker = {
  rerank(
    query: RetrievalQuery,
    documents: Document[],
    context?: AdapterCallContext,
  ): MaybePromise<Document[]>;
  metadata?: AdapterMetadata;
};

export type DocumentLoader = {
  load(): MaybePromise<Document[]>;
  metadata?: AdapterMetadata;
};

export type DocumentTransformer = {
  transform(documents: Document[], context?: AdapterCallContext): MaybePromise<Document[]>;
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
  args?: StructuredQueryFilter[];
};

export type StructuredQueryFilter = StructuredQueryComparison | StructuredQueryOperation;

export type StructuredQuery = {
  query: string;
  filter?: StructuredQueryFilter;
};
