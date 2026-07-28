import type { AdapterDiagnostic, AdapterMetadata, AdapterRequest, AdapterTraceEvent } from "./core";
import type { Document } from "./documents";
import type { RetrievalQuery } from "./retrieval";
import type { StreamEvent } from "./stream";
import type { MaybeAsyncIterable, MaybePromise } from "#shared/maybe";

export type QueryResult = {
  query?: RetrievalQuery;
  text: string;
  sources?: Document[];
  diagnostics?: AdapterDiagnostic[];
  trace?: AdapterTraceEvent[];
  raw?: unknown;
  metadata?: AdapterMetadata;
};

export type QueryStreamEvent = StreamEvent;

export type QueryEngine = {
  query(request: AdapterRequest<{ query: RetrievalQuery }>): MaybePromise<QueryResult>;
  stream?(request: AdapterRequest<{ query: RetrievalQuery }>): MaybeAsyncIterable<QueryStreamEvent>;
  metadata?: AdapterMetadata;
};

export type SynthesisInput = {
  query: RetrievalQuery;
  documents: Document[];
};

export type ResponseSynthesizer = {
  synthesize(request: AdapterRequest<SynthesisInput>): MaybePromise<QueryResult>;
  stream?(request: AdapterRequest<SynthesisInput>): MaybeAsyncIterable<QueryStreamEvent>;
  metadata?: AdapterMetadata;
};
