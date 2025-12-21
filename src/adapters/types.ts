// References: docs/stage-7.md; docs/implementation-plan.md (Stage 7)

export type AdapterDocument = {
  id?: string;
  text: string;
  metadata?: Record<string, unknown>;
  score?: number;
};

export type AdapterMessageRole = "system" | "user" | "assistant" | "tool";

export type AdapterMessage = {
  role: AdapterMessageRole;
  content: AdapterMessageContent;
  name?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
};

export type AdapterStructuredContent = {
  text: string;
  parts: AdapterMessagePart[];
  raw?: unknown;
};

export type AdapterMessageContent = string | AdapterStructuredContent;

export type AdapterMessagePart =
  | AdapterTextPart
  | AdapterImagePart
  | AdapterFilePart
  | AdapterReasoningPart
  | AdapterToolCallPart
  | AdapterToolResultPart
  | AdapterDataPart;

export type AdapterTextPart = {
  type: "text";
  text: string;
};

export type AdapterImagePart = {
  type: "image";
  url?: string;
  data?: string;
  mimeType?: string;
  mediaType?: string;
  detail?: "high" | "low" | "auto";
};

export type AdapterFilePart = {
  type: "file";
  data: string;
  mimeType?: string;
  mediaType?: string;
};

export type AdapterReasoningPart = {
  type: "reasoning";
  text: string;
};

export type AdapterToolCallPart = {
  type: "tool-call";
  toolCallId?: string;
  toolName: string;
  input: unknown;
};

export type AdapterToolResultPart = {
  type: "tool-result";
  toolCallId?: string;
  toolName: string;
  output: unknown;
  isError?: boolean;
};

export type AdapterDataPart = {
  type: "data";
  data: unknown;
};

export type AdapterToolParam = {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
};

export type AdapterTool = {
  name: string;
  description?: string;
  params?: AdapterToolParam[];
  inputSchema?: AdapterSchema;
  outputSchema?: AdapterSchema;
  execute?: (input: unknown) => AdapterMaybePromise<unknown>;
};

export type AdapterToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
};

export type AdapterToolResult = {
  name: string;
  result: unknown;
  toolCallId?: string;
  isError?: boolean;
};

type AdapterModelCallBase = {
  model?: string;
  system?: string;
  tools?: AdapterTool[];
  toolChoice?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
};

export type AdapterModelCall =
  | (AdapterModelCallBase & { messages: AdapterMessage[]; prompt?: never })
  | (AdapterModelCallBase & { prompt: string; messages?: never });

export type AdapterModelResult = {
  text?: string;
  toolCalls?: AdapterToolCall[];
  raw?: unknown;
  metadata?: Record<string, unknown>;
};

export type AdapterStreamChunk = {
  textDelta?: string;
  toolCallDelta?: AdapterToolCall;
  raw?: unknown;
};

export type AdapterRetrievalQuery = string | AdapterMessageContent;

export type AdapterRetrievalResult = {
  query?: AdapterRetrievalQuery;
  documents: AdapterDocument[];
  citations?: Array<{ id?: string; text?: string; source?: string }>;
};

export type AdapterTraceEvent = {
  name: string;
  timestamp?: number;
  data?: Record<string, unknown>;
};

export type AdapterDiagnostic = {
  level: "warn" | "error";
  message: string;
  data?: unknown;
};

export type AdapterBundle = {
  documents?: AdapterDocument[];
  messages?: AdapterMessage[];
  tools?: AdapterTool[];
  prompts?: AdapterPromptTemplate[];
  schemas?: AdapterSchema[];
  textSplitter?: AdapterTextSplitter;
  embedder?: AdapterEmbedder;
  retriever?: AdapterRetriever;
  reranker?: AdapterReranker;
  loader?: AdapterDocumentLoader;
  transformer?: AdapterDocumentTransformer;
  memory?: AdapterMemory;
  storage?: AdapterStorage;
  kv?: AdapterKVStore;
};

export type AdapterResumeRequest = {
  token: unknown;
  humanInput?: unknown;
  runtime?: unknown;
  adapters?: AdapterBundle;
};

export type AdapterResumeResult = {
  input: unknown;
  runtime?: unknown;
  adapters?: AdapterBundle;
};

export type AdapterResumeReturn = AdapterResumeResult | unknown;

export type AdapterResume = {
  resolve: (request: AdapterResumeRequest) => AdapterMaybePromise<AdapterResumeReturn>;
};

export type AdapterBlob = {
  id?: string;
  contentType?: string;
  bytes: Uint8Array;
  metadata?: Record<string, unknown>;
};

export type AdapterKVStore<V = unknown> = {
  mget(keys: string[]): AdapterMaybePromise<Array<V | undefined>>;
  mset(pairs: Array<[string, V]>): AdapterMaybePromise<void>;
  mdelete(keys: string[]): AdapterMaybePromise<void>;
  list(prefix?: string): AdapterMaybePromise<string[]>;
};

export type AdapterStorage = {
  get(key: string): AdapterMaybePromise<AdapterBlob | undefined>;
  put(key: string, blob: AdapterBlob): AdapterMaybePromise<void>;
  delete(key: string): AdapterMaybePromise<void>;
  list(prefix?: string): AdapterMaybePromise<string[]>;
};

export type AdapterPromptSchema = {
  name: string;
  description?: string;
  inputs: Array<{ name: string; type: string; description?: string; required?: boolean }>;
  outputs?: Array<{ name: string; type: string; description?: string }>;
};

export type AdapterPromptTemplate = {
  name: string;
  template: string;
  schema?: AdapterPromptSchema;
  metadata?: Record<string, unknown>;
};

export type AdapterSchema = {
  name?: string;
  jsonSchema: unknown;
  kind?: "json-schema" | "zod" | "unknown";
};

export type AdapterStructuredResult<T = unknown> = {
  value: T;
  raw?: unknown;
};

export type AdapterTextSplitter = {
  split(text: string): AdapterMaybePromise<string[]>;
  splitBatch?(texts: string[]): AdapterMaybePromise<string[][]>;
  splitWithMetadata?(
    text: string,
  ): AdapterMaybePromise<Array<{ text: string; metadata?: Record<string, unknown> }>>;
  metadata?: Record<string, unknown>;
};

export type AdapterEmbedder = {
  embed(text: string): AdapterMaybePromise<number[]>;
  embedMany?(texts: string[]): AdapterMaybePromise<number[][]>;
  metadata?: Record<string, unknown>;
};

export type AdapterRetriever = {
  retrieve(query: AdapterRetrievalQuery): AdapterMaybePromise<AdapterRetrievalResult>;
  metadata?: Record<string, unknown>;
};

export type AdapterReranker = {
  rerank(
    query: AdapterRetrievalQuery,
    documents: AdapterDocument[],
  ): AdapterMaybePromise<AdapterDocument[]>;
  metadata?: Record<string, unknown>;
};

export type AdapterDocumentLoader = {
  load(): AdapterMaybePromise<AdapterDocument[]>;
  metadata?: Record<string, unknown>;
};

export type AdapterDocumentTransformer = {
  transform(documents: AdapterDocument[]): AdapterMaybePromise<AdapterDocument[]>;
  metadata?: Record<string, unknown>;
};

export type AdapterTurn = {
  role: AdapterMessageRole;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
};

export type AdapterThread = {
  id: string;
  turns: AdapterTurn[];
  metadata?: Record<string, unknown>;
};

export type AdapterMemory = {
  append?(threadId: string, turn: AdapterTurn): AdapterMaybePromise<void>;
  read?(threadId: string): AdapterMaybePromise<AdapterThread | undefined>;
  summarize?(threadId: string): AdapterMaybePromise<string>;
  load?(input: Record<string, unknown>): AdapterMaybePromise<Record<string, unknown>>;
  save?(input: Record<string, unknown>, output: Record<string, unknown>): AdapterMaybePromise<void>;
  reset?(): AdapterMaybePromise<void>;
};

export type AdapterMaybePromise<T> = Promise<T> | T;
