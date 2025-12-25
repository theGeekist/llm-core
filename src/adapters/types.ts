// References: docs/stage-7.md; docs/implementation-plan.md (Stage 7)

import type { MaybePromise } from "../maybe";

/* -------------------------------------------------------------------------------------------------
 * Core metadata + requirements
 * ------------------------------------------------------------------------------------------------- */

export type AdapterRequirement =
  | { kind: "construct"; name: string }
  | { kind: "capability"; name: string };

export type AdapterMetadata = {
  requires?: AdapterRequirement[];
  [key: string]: unknown;
};

export type AdapterDiagnostic = {
  level: "warn" | "error";
  message: string;
  data?: unknown;
};

export type PauseKind = "human" | "external" | "system";

export type ResumeSnapshot = {
  token: unknown;
  pauseKind?: PauseKind;
  createdAt: number;
  lastAccessedAt?: number;
  payload?: unknown;
};

export type AdapterCallContext = {
  report?: (diagnostic: AdapterDiagnostic) => void;
};

/* -------------------------------------------------------------------------------------------------
 * Documents
 * ------------------------------------------------------------------------------------------------- */

export type Document = {
  id?: string;
  text: string;
  metadata?: AdapterMetadata;
  score?: number;
};

/* -------------------------------------------------------------------------------------------------
 * Messages + content parts
 * ------------------------------------------------------------------------------------------------- */

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type TextPart = {
  type: "text";
  text: string;
};

export type ImagePart = {
  type: "image";
  url?: string;
  data?: string;
  mimeType?: string;
  mediaType?: string;
  detail?: "high" | "low" | "auto";
};

export type FilePart = {
  type: "file";
  data: string;
  mimeType?: string;
  mediaType?: string;
};

export type ReasoningPart = {
  type: "reasoning";
  text: string;
};

export type ToolCallPart = {
  type: "tool-call";
  toolCallId?: string;
  toolName: string;
  input: unknown;
};

export type ToolResultPart = {
  type: "tool-result";
  toolCallId?: string;
  toolName: string;
  output: unknown;
  isError?: boolean;
};

export type DataPart = {
  type: "data";
  data: unknown;
};

export type MessagePart =
  | DataPart
  | FilePart
  | ImagePart
  | ReasoningPart
  | TextPart
  | ToolCallPart
  | ToolResultPart;

export type StructuredContent = {
  text: string;
  parts: MessagePart[];
  raw?: unknown;
};

export type MessageContent = string | StructuredContent;

export type Message = {
  role: MessageRole;
  content: MessageContent;
  name?: string;
  toolCallId?: string;
  metadata?: AdapterMetadata;
};

/* -------------------------------------------------------------------------------------------------
 * Schemas + prompts
 * ------------------------------------------------------------------------------------------------- */

export type Schema = {
  name?: string;
  jsonSchema: unknown;
  kind?: "json-schema" | "zod" | "unknown";
};

export type PromptSchema = {
  name: string;
  description?: string;
  inputs: Array<{ name: string; type: string; description?: string; required?: boolean }>;
  outputs?: Array<{ name: string; type: string; description?: string }>;
};

export type PromptTemplate = {
  name: string;
  template: string;
  schema?: PromptSchema;
  metadata?: AdapterMetadata;
};

/* -------------------------------------------------------------------------------------------------
 * Tools
 * ------------------------------------------------------------------------------------------------- */

export type ToolParam = {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
};

export type Tool = {
  name: string;
  description?: string;
  params?: ToolParam[];
  inputSchema?: Schema;
  outputSchema?: Schema;
  execute?: (input: unknown, context?: AdapterCallContext) => MaybePromise<unknown>;
};

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
};

export type ToolResult = {
  name: string;
  result: unknown;
  toolCallId?: string;
  isError?: boolean;
};

/* -------------------------------------------------------------------------------------------------
 * Model call + results + telemetry
 * ------------------------------------------------------------------------------------------------- */

type ModelCallBase = {
  model?: string;
  system?: string;
  tools?: Tool[];
  toolChoice?: string;
  responseSchema?: Schema;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  metadata?: AdapterMetadata;
};

export type ModelCall = ModelCallBase & {
  messages?: Message[];
  prompt?: string;
};

export type ModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  [key: string]: unknown;
};

export type ModelMeta = {
  provider?: string;
  modelId?: string;
  requestId?: string;
  latencyMs?: number;
  [key: string]: unknown;
};

export type ModelRequest = {
  body?: unknown;
};

export type ModelResponse = {
  id?: string;
  modelId?: string;
  timestamp?: number;
  headers?: Record<string, string>;
  body?: unknown;
};

export type ModelTelemetry = {
  request?: ModelRequest;
  response?: ModelResponse;
  usage?: ModelUsage;
  totalUsage?: ModelUsage;
  warnings?: AdapterDiagnostic[];
  providerMetadata?: Record<string, unknown>;
};

export type AdapterTraceEvent = {
  name: string;
  timestamp?: number;
  data?: Record<string, unknown>;
};

export type ModelResult = {
  text?: string;
  messages?: Message[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  reasoning?: unknown;
  output?: unknown;
  diagnostics?: AdapterDiagnostic[];
  trace?: AdapterTraceEvent[];
  telemetry?: ModelTelemetry;
  usage?: ModelUsage;
  meta?: ModelMeta;
  raw?: unknown;
  metadata?: AdapterMetadata;
};

export type Model = {
  generate(call: ModelCall): MaybePromise<ModelResult>;
  stream?(call: ModelCall): MaybePromise<AsyncIterable<ModelStreamEvent>>;
};

export type StreamChunk = {
  textDelta?: string;
  toolCallDelta?: ToolCall;
  raw?: unknown;
};

export type ModelStreamEvent =
  | {
      type: "start";
      id?: string;
      modelId?: string;
      timestamp?: number;
    }
  | {
      type: "delta";
      text?: string;
      reasoning?: string;
      toolCall?: ToolCall;
      toolResult?: ToolResult;
      raw?: unknown;
      timestamp?: number;
    }
  | {
      type: "usage";
      usage: ModelUsage;
    }
  | {
      type: "end";
      finishReason?: string;
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

export type AdapterTraceSink = {
  emit(event: AdapterTraceEvent): MaybePromise<void>;
  emitMany?(events: AdapterTraceEvent[]): MaybePromise<void>;
};

/* -------------------------------------------------------------------------------------------------
 * Images + speech + transcription
 * ------------------------------------------------------------------------------------------------- */

export type ImageCall = {
  prompt: string;
  count?: number;
  size?: string;
  aspectRatio?: string;
  seed?: number;
  providerOptions?: Record<string, Record<string, unknown>>;
  headers?: Record<string, string | undefined>;
  abortSignal?: AbortSignal;
  metadata?: AdapterMetadata;
};

export type ImageResult = {
  images: Blob[];
  diagnostics?: AdapterDiagnostic[];
  telemetry?: ModelTelemetry;
  usage?: ModelUsage;
  trace?: AdapterTraceEvent[];
  meta?: ModelMeta;
  raw?: unknown;
};

export type ImageModel = {
  generate(call: ImageCall, context?: AdapterCallContext): MaybePromise<ImageResult>;
};

export type SpeechCall = {
  text: string;
  voice?: string;
  outputFormat?: string;
  instructions?: string;
  speed?: number;
  language?: string;
  providerOptions?: Record<string, Record<string, unknown>>;
  headers?: Record<string, string | undefined>;
  abortSignal?: AbortSignal;
  metadata?: AdapterMetadata;
};

export type SpeechResult = {
  audio: Blob;
  diagnostics?: AdapterDiagnostic[];
  telemetry?: ModelTelemetry;
  trace?: AdapterTraceEvent[];
  meta?: ModelMeta;
  raw?: unknown;
};

export type SpeechModel = {
  generate(call: SpeechCall, context?: AdapterCallContext): MaybePromise<SpeechResult>;
};

export type TranscriptionCall = {
  audio: Blob;
  providerOptions?: Record<string, Record<string, unknown>>;
  headers?: Record<string, string | undefined>;
  abortSignal?: AbortSignal;
  metadata?: AdapterMetadata;
};

export type TranscriptionSegment = {
  text: string;
  startSecond: number;
  endSecond: number;
};

export type TranscriptionResult = {
  text: string;
  segments?: TranscriptionSegment[];
  language?: string;
  durationSeconds?: number;
  diagnostics?: AdapterDiagnostic[];
  telemetry?: ModelTelemetry;
  trace?: AdapterTraceEvent[];
  meta?: ModelMeta;
  raw?: unknown;
};

export type TranscriptionModel = {
  generate(
    call: TranscriptionCall,
    context?: AdapterCallContext,
  ): MaybePromise<TranscriptionResult>;
};

/* -------------------------------------------------------------------------------------------------
 * Retrieval + splitting + embeddings
 * ------------------------------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------------------------------
 * Vector store write path
 * ------------------------------------------------------------------------------------------------- */

export type VectorRecord = {
  id?: string;
  values: number[];
  metadata?: AdapterMetadata;
  document?: Document;
};

export type VectorStoreUpsertInput =
  | { documents: Document[]; namespace?: string }
  | { vectors: VectorRecord[]; namespace?: string };

export type VectorStoreDeleteInput =
  | { ids: string[]; namespace?: string }
  | { filter: Record<string, unknown>; namespace?: string };

export type VectorStoreInfo = {
  dimension?: number;
  metadataSchema?: Record<string, unknown>;
  filterSchema?: Record<string, unknown>;
  namespace?: string;
};

export type VectorStoreUpsertResult = {
  ids?: string[];
};

export type VectorStore = {
  upsert(
    input: VectorStoreUpsertInput,
    context?: AdapterCallContext,
  ): MaybePromise<VectorStoreUpsertResult | void>;
  delete(input: VectorStoreDeleteInput, context?: AdapterCallContext): MaybePromise<void>;
  info?: VectorStoreInfo;
  metadata?: AdapterMetadata;
};

/* -------------------------------------------------------------------------------------------------
 * Storage + KV
 * ------------------------------------------------------------------------------------------------- */

export type Blob = {
  id?: string;
  contentType?: string;
  bytes: Uint8Array;
  metadata?: Record<string, unknown>;
};

export type KVStore<V = unknown> = {
  list(prefix?: string, context?: AdapterCallContext): MaybePromise<string[]>;
  mdelete(keys: string[], context?: AdapterCallContext): MaybePromise<void>;
  mget(keys: string[], context?: AdapterCallContext): MaybePromise<Array<V | undefined>>;
  mset(pairs: Array<[string, V]>, context?: AdapterCallContext): MaybePromise<void>;
};

export type Cache = {
  get(key: string, context?: AdapterCallContext): MaybePromise<Blob | undefined>;
  set(key: string, value: Blob, ttlMs?: number, context?: AdapterCallContext): MaybePromise<void>;
  delete(key: string, context?: AdapterCallContext): MaybePromise<void>;
};

export type Storage = {
  delete(key: string, context?: AdapterCallContext): MaybePromise<void>;
  get(key: string, context?: AdapterCallContext): MaybePromise<Blob | undefined>;
  list(prefix?: string, context?: AdapterCallContext): MaybePromise<string[]>;
  put(key: string, blob: Blob, context?: AdapterCallContext): MaybePromise<void>;
};

/* -------------------------------------------------------------------------------------------------
 * Memory
 * ------------------------------------------------------------------------------------------------- */

export type Turn = {
  role: MessageRole;
  content: string;
  timestamp?: number;
  metadata?: AdapterMetadata;
};

export type Thread = {
  id: string;
  turns: Turn[];
  metadata?: AdapterMetadata;
};

export type Memory = {
  append?(threadId: string, turn: Turn, context?: AdapterCallContext): MaybePromise<void>;
  load?(
    input: Record<string, unknown>,
    context?: AdapterCallContext,
  ): MaybePromise<Record<string, unknown>>;
  read?(threadId: string, context?: AdapterCallContext): MaybePromise<Thread | undefined>;
  reset?(context?: AdapterCallContext): MaybePromise<void>;
  save?(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    context?: AdapterCallContext,
  ): MaybePromise<void>;
  summarize?(threadId: string, context?: AdapterCallContext): MaybePromise<string>;
};

/* -------------------------------------------------------------------------------------------------
 * Bundles + resume
 * ------------------------------------------------------------------------------------------------- */

export type AdapterBundle = {
  cache?: Cache;
  constructs?: Record<string, unknown>;
  documents?: Document[];
  embedder?: Embedder;
  image?: ImageModel;
  kv?: KVStore;
  loader?: DocumentLoader;
  memory?: Memory;
  messages?: Message[];
  model?: Model;
  prompts?: PromptTemplate[];
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
