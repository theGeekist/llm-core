import type { AdapterDiagnostic, AdapterMetadata, AdapterTraceEvent, TraceIdentity } from "./core";
import type { Message } from "./messages";
import type { Schema } from "./schema";
import type { Tool, ToolCall, ToolResult } from "./tools";
import type { StreamEvent } from "./stream";
import type { MaybeAsyncIterable, MaybePromise } from "../../maybe";

type ModelCallBase = {
  model?: string | null;
  system?: string | null;
  tools?: Tool[] | null;
  toolChoice?: string | null;
  responseSchema?: Schema | null;
  temperature?: number | null;
  topP?: number | null;
  maxTokens?: number | null;
  metadata?: AdapterMetadata | null;
};

export type ModelCall = ModelCallBase & {
  messages?: Message[] | null;
  prompt?: string | null;
};

export type ModelUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  [key: string]: unknown;
};

export type ModelMeta = {
  provider?: string | null;
  modelId?: string | null;
  requestId?: string | null;
  latencyMs?: number | null;
  [key: string]: unknown;
};

export type ModelRequest = {
  body?: unknown | null;
  headers?: Record<string, string> | null;
};

export type ModelResponse = TraceIdentity & {
  body?: unknown | null;
  headers?: Record<string, string> | null;
};

export type ModelTelemetry = {
  request?: ModelRequest | null;
  response?: ModelResponse | null;
  usage?: ModelUsage | null;
  totalUsage?: ModelUsage | null;
  warnings?: AdapterDiagnostic[] | null;
  providerMetadata?: Record<string, unknown> | null;
};

export type ModelResult = {
  text?: string | null;
  messages?: Message[] | null;
  toolCalls?: ToolCall[] | null;
  toolResults?: ToolResult[] | null;
  reasoning?: unknown | null;
  output?: unknown | null;
  diagnostics?: AdapterDiagnostic[] | null;
  trace?: AdapterTraceEvent[] | null;
  telemetry?: ModelTelemetry | null;
  usage?: ModelUsage | null;
  meta?: ModelMeta | null;
  raw?: unknown | null;
  metadata?: AdapterMetadata | null;
};

export type Model = {
  generate(call: ModelCall): MaybePromise<ModelResult>;
  stream?(call: ModelCall): MaybeAsyncIterable<StreamEvent>;
  metadata?: AdapterMetadata | null;
};

export type ModelStreamEvent = StreamEvent;
