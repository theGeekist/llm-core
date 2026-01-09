import type {
  AdapterDiagnostic,
  ModelStreamEvent,
  ModelUsage,
  ToolCall,
  ToolResult,
} from "./types";

export type StreamMeta = {
  id?: string;
  modelId?: string;
  timestamp?: number;
};

export const toStreamStartEvent = (meta?: StreamMeta): ModelStreamEvent => ({
  type: "start",
  id: meta?.id,
  modelId: meta?.modelId,
  timestamp: meta?.timestamp,
});

export const toStreamDeltaTextEvent = (
  text: string | undefined,
  raw?: unknown,
): ModelStreamEvent => ({
  type: "delta",
  text,
  raw,
});

export const toStreamDeltaReasoningEvent = (
  reasoning: string | undefined,
  raw?: unknown,
): ModelStreamEvent => ({
  type: "delta",
  reasoning,
  raw,
});

export const toStreamDeltaToolCallEvent = (
  toolCall: ToolCall,
  raw?: unknown,
): ModelStreamEvent => ({
  type: "delta",
  toolCall,
  raw,
});

export const toStreamDeltaToolResultEvent = (
  toolResult: ToolResult,
  raw?: unknown,
): ModelStreamEvent => ({
  type: "delta",
  toolResult,
  raw,
});

export const toStreamUsageEvent = (usage: ModelUsage): ModelStreamEvent => ({
  type: "usage",
  usage,
});

export const toStreamEndEvent = (
  diagnostics: AdapterDiagnostic[] | undefined,
  meta?: StreamMeta,
  raw?: unknown,
): ModelStreamEvent => ({
  type: "end",
  diagnostics,
  raw,
  timestamp: meta?.timestamp,
});

export const toStreamErrorEvent = (
  error: unknown,
  diagnostics?: AdapterDiagnostic[],
): ModelStreamEvent => ({
  type: "error",
  error,
  diagnostics,
});
