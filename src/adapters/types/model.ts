import type { AdapterDiagnostic, AdapterMetadata, AdapterTraceEvent, TraceIdentity } from "./core";
import type { Message } from "./messages";
import type { Schema } from "./schema";
import type { Tool, ToolCall, ToolResult } from "./tools";
import type { StreamEvent } from "./stream";
import type { MaybeAsyncIterable, MaybePromise } from "../../maybe";

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
  headers?: Record<string, string>;
};

export type ModelResponse = TraceIdentity & {
  body?: unknown;
  headers?: Record<string, string>;
};

export type ModelTelemetry = {
  request?: ModelRequest;
  response?: ModelResponse;
  usage?: ModelUsage;
  totalUsage?: ModelUsage;
  warnings?: AdapterDiagnostic[];
  providerMetadata?: Record<string, unknown>;
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
  stream?(call: ModelCall): MaybeAsyncIterable<StreamEvent>;
  metadata?: AdapterMetadata;
};

export type ModelStreamEvent = StreamEvent;
