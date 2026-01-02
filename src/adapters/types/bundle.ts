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
import type { MaybePromise } from "../../maybe";

type AdapterDataBundle = {
  documents?: Document[];
  messages?: Message[];
  prompts?: PromptTemplate[];
  schemas?: Schema[];
  constructs?: Record<string, unknown>;
};

type AdapterModelBundle = {
  model?: Model;
  tools?: Tool[];
  outputParser?: OutputParser;
};

type AdapterRetrievalBundle = {
  loader?: DocumentLoader;
  textSplitter?: TextSplitter;
  transformer?: DocumentTransformer;
  embedder?: Embedder;
  retriever?: Retriever;
  reranker?: Reranker;
  vectorStore?: VectorStore;
  indexing?: Indexing;
  queryEngine?: QueryEngine;
  responseSynthesizer?: ResponseSynthesizer;
};

type AdapterMediaBundle = {
  image?: ImageModel;
  speech?: SpeechModel;
  transcription?: TranscriptionModel;
};

type AdapterOrchestrationBundle = {
  cache?: Cache;
  kv?: KVStore;
  storage?: Storage;
  memory?: Memory;
  trace?: EventStream;
  checkpoint?: CheckpointStore;
  eventStream?: EventStream;
  interrupt?: InterruptStrategy;
};

export type AdapterBundle = AdapterDataBundle &
  AdapterModelBundle &
  AdapterRetrievalBundle &
  AdapterMediaBundle &
  AdapterOrchestrationBundle;

export type AdapterResumeRequest = {
  adapters?: AdapterBundle;
  declaredAdapters?: AdapterBundle;
  interrupt?: InterruptStrategy;
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
