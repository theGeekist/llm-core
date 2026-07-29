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
  split(request: TextSplitRequest, context: InvocationContext): MaybePromise<string[]>;
  splitBatch?(request: TextSplitBatchRequest, context: InvocationContext): MaybePromise<string[][]>;
  splitWithMetadata?(
    request: TextSplitRequest,
    context: InvocationContext,
  ): MaybePromise<DocumentChunk[]>;
}

export interface EmbedRequest {
  text: string;
}

export interface EmbedManyRequest {
  texts: string[];
}

export interface Embedder {
  embed(request: EmbedRequest, context: InvocationContext): MaybePromise<number[]>;
  embedMany?(request: EmbedManyRequest, context: InvocationContext): MaybePromise<number[][]>;
}

export interface RetrieveRequest {
  query: RetrievalQuery;
}

export interface Retriever {
  retrieve(request: RetrieveRequest, context: InvocationContext): MaybePromise<RetrievalResult>;
}

export interface RerankRequest {
  query: RetrievalQuery;
  documents: Document[];
}

export interface Reranker {
  rerank(request: RerankRequest, context: InvocationContext): MaybePromise<Document[]>;
}

export interface DocumentLoader {
  load(context: InvocationContext): MaybePromise<Document[]>;
}

export interface DocumentTransformer {
  transform(documents: Document[], context: InvocationContext): MaybePromise<Document[]>;
}

export interface QueryRequest {
  query: RetrievalQuery;
}

export interface QueryEngine {
  query(request: QueryRequest, context: InvocationContext): MaybePromise<QueryResult>;
  stream?(request: QueryRequest, context: InvocationContext): MaybeAsyncIterable<QueryStreamEvent>;
}

export interface SynthesisRequest {
  query: RetrievalQuery;
  documents: Document[];
}

export interface ResponseSynthesizer {
  synthesize(request: SynthesisRequest, context: InvocationContext): MaybePromise<QueryResult>;
  stream?(
    request: SynthesisRequest,
    context: InvocationContext,
  ): MaybeAsyncIterable<QueryStreamEvent>;
}
