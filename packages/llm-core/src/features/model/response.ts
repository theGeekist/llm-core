import type { NativeExtensions } from "#contracts";
import type { ModelContentPart } from "./content";
import type { ProviderRef } from "./references";

/** Neutral model response (ADR-004). Native objects never appear in these fields. */

export type FinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other";

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

export type WarningSeverity = "info" | "warning";

export interface ModelWarning {
  code: string;
  message: string;
  severity?: WarningSeverity;
}

export type ModelErrorCode =
  | "provider-error"
  | "rate-limited"
  | "timeout"
  | "invalid-request"
  | "content-filter"
  | "unknown";

export interface ModelError {
  code: ModelErrorCode;
  message: string;
  retryable?: boolean;
  providerCode?: string;
}

/** Redacted provider-native response metadata under namespaced extensions. */
export interface ProviderResponseMetadata {
  provider?: ProviderRef;
  modelId?: string;
  requestId?: string;
  latencyMs?: number;
  extensions?: NativeExtensions;
}

export interface ModelCompletion {
  kind: "completion";
  content: ModelContentPart[];
  finishReason: FinishReason;
  usage?: ModelUsage;
  warnings?: ModelWarning[];
  metadata?: ProviderResponseMetadata;
}

export interface ModelErrorResponse {
  kind: "error";
  error: ModelError;
  usage?: ModelUsage;
  warnings?: ModelWarning[];
  metadata?: ProviderResponseMetadata;
}

export type ModelResponse = ModelCompletion | ModelErrorResponse;
