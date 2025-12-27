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
import type { AdapterTraceSink } from "./core";
import type { MaybePromise } from "../../maybe";

export type AdapterBundle = {
  cache?: Cache;
  checkpoint?: CheckpointStore;
  constructs?: Record<string, unknown>;
  documents?: Document[];
  embedder?: Embedder;
  eventStream?: EventStream;
  image?: ImageModel;
  interrupt?: InterruptStrategy;
  kv?: KVStore;
  indexing?: Indexing;
  loader?: DocumentLoader;
  memory?: Memory;
  messages?: Message[];
  model?: Model;
  outputParser?: OutputParser;
  prompts?: PromptTemplate[];
  queryEngine?: QueryEngine;
  responseSynthesizer?: ResponseSynthesizer;
  reranker?: Reranker;
  retriever?: Retriever;
  schemas?: Schema[];
  speech?: SpeechModel;
  storage?: Storage;
  textSplitter?: TextSplitter;
  transcription?: TranscriptionModel;
  tools?: Tool[];
  trace?: AdapterTraceSink;
  transformer?: DocumentTransformer;
  vectorStore?: VectorStore;
};

export type AdapterResumeRequest = {
  adapters?: AdapterBundle;
  declaredAdapters?: AdapterBundle;
  pauseKind?: PauseKind;
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
