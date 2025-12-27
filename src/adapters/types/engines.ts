import type {
  AdapterCallContext,
  AdapterDiagnostic,
  AdapterMetadata,
  AdapterTraceEvent,
} from "./core";
import type { Document } from "./documents";
import type { RetrievalQuery } from "./retrieval";
import type { MaybePromise } from "../../maybe";

export type QueryResult = {
  query?: RetrievalQuery;
  text: string;
  sources?: Document[];
  diagnostics?: AdapterDiagnostic[];
  trace?: AdapterTraceEvent[];
  raw?: unknown;
  metadata?: AdapterMetadata;
};

export type QueryStreamEvent =
  | {
      type: "start";
      timestamp?: number;
    }
  | {
      type: "delta";
      text?: string;
      raw?: unknown;
      timestamp?: number;
    }
  | {
      type: "end";
      text?: string;
      sources?: Document[];
      raw?: unknown;
      timestamp?: number;
      diagnostics?: AdapterDiagnostic[];
    }
  | {
      type: "error";
      error: unknown;
      diagnostics?: AdapterDiagnostic[];
      raw?: unknown;
      timestamp?: number;
    };

export type QueryEngine = {
  query(query: RetrievalQuery, context?: AdapterCallContext): MaybePromise<QueryResult>;
  stream?(
    query: RetrievalQuery,
    context?: AdapterCallContext,
  ): MaybePromise<AsyncIterable<QueryStreamEvent>>;
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
  ): MaybePromise<AsyncIterable<QueryStreamEvent>>;
  metadata?: AdapterMetadata;
};
