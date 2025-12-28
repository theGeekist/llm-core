import type { AdapterDiagnostic, AdapterMetadata, AdapterTraceEvent } from "./core";
import type { Message } from "./messages";
import type { Schema } from "./schema";
import type { Tool, ToolCall, ToolResult } from "./tools";
import type { MaybePromise } from "../../maybe";

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

type TraceIdentity = {
  id?: string;
  modelId?: string;
  timestamp?: number;
};

export type ModelRequest = {
  body?: unknown;
  headers?: Record<string, string>;
};

export type ModelResponse = TraceIdentity & {
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
  metadata?: AdapterMetadata;
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
