import type { MaybePromise } from "#shared/maybe";

export type AdapterRequirement =
  | { kind: "construct"; name: string }
  | { kind: "capability"; name: string };

export type AdapterMetadata = {
  requires?: AdapterRequirement[] | null;
  retry?: RetryMetadata | null;
  [key: string]: unknown;
};

export type RetryReason = "timeout" | "rate_limit" | "network" | "5xx" | "unknown";

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs?: number | null;
  jitter?: "none" | "full" | null;
  mode?: "internal" | "pause" | null;
  retryOn?: RetryReason[] | null;
  timeoutMs?: number | null;
};

export type RetryConfig = {
  model?: RetryPolicy | null;
  embedder?: RetryPolicy | null;
  retriever?: RetryPolicy | null;
  reranker?: RetryPolicy | null;
  textSplitter?: RetryPolicy | null;
  loader?: RetryPolicy | null;
  transformer?: RetryPolicy | null;
  vectorStore?: RetryPolicy | null;
  cache?: RetryPolicy | null;
  kv?: RetryPolicy | null;
  memory?: RetryPolicy | null;
  storage?: RetryPolicy | null;
  outputParser?: RetryPolicy | null;
  queryEngine?: RetryPolicy | null;
  responseSynthesizer?: RetryPolicy | null;
  image?: RetryPolicy | null;
  speech?: RetryPolicy | null;
  transcription?: RetryPolicy | null;
  tools?: RetryPolicy | null;
};

export type RetryMetadata = {
  allowed?: boolean | null;
  retryOn?: RetryReason[] | null;
  restartable?: boolean | null;
  policy?: RetryPolicy | null;
};

export type AdapterDiagnostic = {
  level: "warn" | "error";
  message: string;
  data?: unknown | null;
};

export type PauseKind = "human" | "external" | "system";

export type ResumeSnapshot = {
  token: unknown;
  resumeKey?: string | null;
  pauseKind?: PauseKind | null;
  createdAt: number;
  lastAccessedAt?: number | null;
  payload?: unknown | null;
  snapshot?: unknown | null;
};

export type AdapterCallContext = {
  report?: (diagnostic: AdapterDiagnostic) => void;
};

export type TraceIdentity = {
  id?: string | null;
  modelId?: string | null;
  timestamp?: number | null;
};

export type AdapterTraceEvent = TraceIdentity & {
  name: string;
  data?: Record<string, unknown> | null;
};

export interface EventStreamEvent extends AdapterTraceEvent {}

export type EventStream = {
  emit(event: EventStreamEvent): MaybePromise<boolean | null>;
  emitMany?(events: EventStreamEvent[]): MaybePromise<boolean | null>;
};
