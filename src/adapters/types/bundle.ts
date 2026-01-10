import type { PauseKind, ResumeSnapshot } from "./core";
import type { Document } from "./documents";
import type { Message } from "./messages";
import type { Model } from "./model";
import type { PromptTemplate, Schema } from "./schema";
import type { OutputParser } from "./output-parser";
import type { Tool } from "./tools";
import type { QueryEngine, ResponseSynthesizer } from "./engines";
import type { Indexing } from "./indexing";
import type { CheckpointStore, EventStream, InterruptStrategy } from "./orchestration";
import type {
  DocumentLoader,
  DocumentTransformer,
  Embedder,
  Reranker,
  Retriever,
  TextSplitter,
} from "./retrieval";
import type { Cache, KVStore, Storage } from "./storage";
import type { Memory } from "./memory";
import type { ImageModel, SpeechModel, TranscriptionModel } from "./media";
import type { VectorStore } from "./vector";
import type { MaybePromise } from "#shared/maybe";

type AdapterDataBundle = {
  documents?: Document[] | null;
  messages?: Message[] | null;
  prompts?: PromptTemplate[] | null;
  schemas?: Schema[] | null;
  constructs?: Record<string, unknown> | null;
};

type AdapterModelBundle = {
  model?: Model | null;
  tools?: Tool[] | null;
  outputParser?: OutputParser | null;
};

type AdapterRetrievalBundle = {
  loader?: DocumentLoader | null;
  textSplitter?: TextSplitter | null;
  transformer?: DocumentTransformer | null;
  embedder?: Embedder | null;
  retriever?: Retriever | null;
  reranker?: Reranker | null;
  vectorStore?: VectorStore | null;
  indexing?: Indexing | null;
  queryEngine?: QueryEngine | null;
  responseSynthesizer?: ResponseSynthesizer | null;
};

type AdapterMediaBundle = {
  image?: ImageModel | null;
  speech?: SpeechModel | null;
  transcription?: TranscriptionModel | null;
};

type AdapterOrchestrationBundle = {
  cache?: Cache | null;
  kv?: KVStore | null;
  storage?: Storage | null;
  memory?: Memory | null;
  trace?: EventStream | null;
  checkpoint?: CheckpointStore | null;
  eventStream?: EventStream | null;
  interrupt?: InterruptStrategy | null;
};

export type AdapterBundle = AdapterDataBundle &
  AdapterModelBundle &
  AdapterRetrievalBundle &
  AdapterMediaBundle &
  AdapterOrchestrationBundle;

export type AdapterResumeRequest = {
  adapters?: AdapterBundle;
  declaredAdapters?: AdapterBundle;
  interrupt?: InterruptStrategy | null;
  pauseKind?: PauseKind;
  resumeKey?: string;
  resumeSnapshot?: ResumeSnapshot;
  resumeInput?: unknown;
  providers?: Record<string, string>;
  runtime?: unknown;
  token: unknown;
};

export type AdapterResumeResult = {
  adapters?: AdapterBundle;
  input: unknown;
  providers?: Record<string, string>;
  runtime?: unknown;
};

export type AdapterResumeReturn = AdapterResumeResult | unknown;

export type AdapterResume = {
  resolve: (request: AdapterResumeRequest) => MaybePromise<AdapterResumeReturn>;
  /**
   * @deprecated Use `adapters.cache` instead.
   */
  sessionStore?: unknown;
  /**
   * @deprecated Use `adapters.cache` TTL instead.
   */
  sessionTtlMs?: number;
};
