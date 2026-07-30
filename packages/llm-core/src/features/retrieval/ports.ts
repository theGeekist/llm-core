import type { InvocationContext } from "#contracts";
import type { MaybeAsyncIterable, MaybePromise } from "#shared/maybe";
import type { Document, DocumentChunk } from "./document";
import type { QueryResult, QueryStreamEvent, RetrievalQuery, RetrievalResult } from "./query";

export interface TextSplitRequest {
  text: string;
}

export interface TextSplitBatchRequest {
  texts: string[];
}

export interface TextSplitter {
  split(input: TextSplitterSplitInput): MaybePromise<string[]>;
  splitBatch?(input: TextSplitterSplitBatchInput): MaybePromise<string[][]>;
  splitWithMetadata?(input: TextSplitterSplitInput): MaybePromise<DocumentChunk[]>;
}

export interface TextSplitterSplitInput {
  readonly request: TextSplitRequest;
  readonly context: InvocationContext;
}

export interface TextSplitterSplitBatchInput {
  readonly request: TextSplitBatchRequest;
  readonly context: InvocationContext;
}

export interface EmbedRequest {
  text: string;
}

export interface EmbedManyRequest {
  texts: string[];
}

export interface Embedder {
  embed(input: EmbedderEmbedInput): MaybePromise<number[]>;
  embedMany?(input: EmbedderEmbedManyInput): MaybePromise<number[][]>;
}

export interface EmbedderEmbedInput {
  readonly request: EmbedRequest;
  readonly context: InvocationContext;
}

export interface EmbedderEmbedManyInput {
  readonly request: EmbedManyRequest;
  readonly context: InvocationContext;
}

export interface RetrieveRequest {
  query: RetrievalQuery;
}

export interface Retriever {
  retrieve(input: RetrieverRetrieveInput): MaybePromise<RetrievalResult>;
}

export interface RetrieverRetrieveInput {
  readonly request: RetrieveRequest;
  readonly context: InvocationContext;
}

export interface RerankRequest {
  query: RetrievalQuery;
  documents: Document[];
}

export interface Reranker {
  rerank(input: RerankerRerankInput): MaybePromise<Document[]>;
}

export interface RerankerRerankInput {
  readonly request: RerankRequest;
  readonly context: InvocationContext;
}

export interface DocumentLoader {
  load(input: DocumentLoaderLoadInput): MaybePromise<Document[]>;
}

export interface DocumentLoaderLoadInput {
  readonly context: InvocationContext;
}

export interface DocumentTransformer {
  transform(input: DocumentTransformerTransformInput): MaybePromise<Document[]>;
}

export interface DocumentTransformerTransformInput {
  readonly documents: Document[];
  readonly context: InvocationContext;
}

export interface QueryRequest {
  query: RetrievalQuery;
}

export interface QueryEngine {
  query(input: QueryEngineQueryInput): MaybePromise<QueryResult>;
  stream?(input: QueryEngineQueryInput): MaybeAsyncIterable<QueryStreamEvent>;
}

export interface QueryEngineQueryInput {
  readonly request: QueryRequest;
  readonly context: InvocationContext;
}

export interface SynthesisRequest {
  query: RetrievalQuery;
  documents: Document[];
}

export interface ResponseSynthesizer {
  synthesize(input: ResponseSynthesizerSynthesizeInput): MaybePromise<QueryResult>;
  stream?(input: ResponseSynthesizerSynthesizeInput): MaybeAsyncIterable<QueryStreamEvent>;
}

export interface ResponseSynthesizerSynthesizeInput {
  readonly request: SynthesisRequest;
  readonly context: InvocationContext;
}
