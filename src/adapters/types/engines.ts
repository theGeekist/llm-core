import type {
  AdapterCallContext,
  AdapterDiagnostic,
  AdapterMetadata,
  AdapterTraceEvent,
} from "./core";
import type { Document } from "./documents";
import type { RetrievalQuery } from "./retrieval";
import type { StreamEvent } from "./stream";
import type { MaybeAsyncIterable, MaybePromise } from "../../shared/maybe";

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
  query(query: RetrievalQuery, context?: AdapterCallContext): MaybePromise<QueryResult>;
  stream?(
    query: RetrievalQuery,
    context?: AdapterCallContext,
  ): MaybeAsyncIterable<QueryStreamEvent>;
  metadata?: AdapterMetadata;
};

export type SynthesisInput = {
  query: RetrievalQuery;
  documents: Document[];
};

export type ResponseSynthesizer = {
  synthesize(input: SynthesisInput, context?: AdapterCallContext): MaybePromise<QueryResult>;
  stream?(
    input: SynthesisInput,
    context?: AdapterCallContext,
  ): MaybeAsyncIterable<QueryStreamEvent>;
  metadata?: AdapterMetadata;
};
