import type { MaybePromise } from "../../maybe";

export type AdapterRequirement =
  | { kind: "construct"; name: string }
  | { kind: "capability"; name: string };

export type AdapterMetadata = {
  requires?: AdapterRequirement[];
  retry?: RetryMetadata;
  [key: string]: unknown;
};

export type RetryReason = "timeout" | "rate_limit" | "network" | "5xx" | "unknown";

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs?: number;
  jitter?: "none" | "full";
  mode?: "internal" | "pause";
  retryOn?: RetryReason[];
  timeoutMs?: number;
};

export type RetryConfig = {
  model?: RetryPolicy;
  embedder?: RetryPolicy;
  retriever?: RetryPolicy;
  reranker?: RetryPolicy;
  textSplitter?: RetryPolicy;
  loader?: RetryPolicy;
  transformer?: RetryPolicy;
  vectorStore?: RetryPolicy;
  cache?: RetryPolicy;
  kv?: RetryPolicy;
  memory?: RetryPolicy;
  storage?: RetryPolicy;
  outputParser?: RetryPolicy;
  queryEngine?: RetryPolicy;
  responseSynthesizer?: RetryPolicy;
  image?: RetryPolicy;
  speech?: RetryPolicy;
  transcription?: RetryPolicy;
  tools?: RetryPolicy;
};

export type RetryMetadata = {
  allowed?: boolean;
  retryOn?: RetryReason[];
  restartable?: boolean;
  policy?: RetryPolicy;
};

export type AdapterDiagnostic = {
  level: "warn" | "error";
  message: string;
  data?: unknown;
};

export type PauseKind = "human" | "external" | "system";

export type ResumeSnapshot = {
  token: unknown;
  resumeKey?: string;
  pauseKind?: PauseKind;
  createdAt: number;
  lastAccessedAt?: number;
  payload?: unknown;
  snapshot?: unknown;
};

export type AdapterCallContext = {
  report?: (diagnostic: AdapterDiagnostic) => void;
};

export type TraceIdentity = {
  id?: string;
  modelId?: string;
  timestamp?: number;
};

export type AdapterTraceEvent = TraceIdentity & {
  name: string;
  data?: Record<string, unknown>;
};

export interface EventStreamEvent extends AdapterTraceEvent {}

export type EventStream = {
  emit(event: EventStreamEvent): MaybePromise<boolean | null>;
  emitMany?(events: EventStreamEvent[]): MaybePromise<boolean | null>;
};
