import type { AdapterDiagnostic } from "./types/core";
import { isRecord as isSharedRecord, isString } from "#shared/guards";
import type { ToolCall, ToolResult } from "./types/tools";
import type { ModelCall, ModelStreamEvent, ModelUsage } from "./types/model";

// --- Base Utils ---

export function warnDiagnostic(message: string, data?: unknown): AdapterDiagnostic {
  return { level: "warn", message, data };
}

export const isRecord = isSharedRecord;

export function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter(isString);
}

export function readString(value: unknown): string | null {
  return isString(value) ? value : null;
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

// --- Model Utils ---

export type MessageInput = {
  messages?: ModelCall["messages"];
  prompt?: ModelCall["prompt"];
  system?: ModelCall["system"];
};

export const buildMessages = <TMessage>(
  input: MessageInput,
  toMessage: (value: NonNullable<ModelCall["messages"]>[number]) => TMessage,
): TMessage[] => {
  const messages = input.messages?.map(toMessage) ?? [];
  if (input.messages === undefined && input.prompt) {
    messages.push(toMessage({ role: "user", content: input.prompt }));
  }
  if (input.system) {
    messages.unshift(toMessage({ role: "system", content: input.system }));
  }
  return messages;
};

export const toResponseFormatSchema = (schema: Record<string, unknown>) => ({
  type: "json_schema",
  json_schema: {
    name: "response",
    schema,
  },
});

export const tryParseJson = (value: string) => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

export const normalizeTimestamp = (value: number) =>
  value < 1_000_000_000_000 ? value * 1000 : value;

export const readStructuredText = (content: unknown) => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (typeof entry === "object" && entry && "text" in entry) {
          const text = (entry as { text?: string }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
};

export const mapToolCalls = <T>(calls: T[] | undefined, map: (call: T) => ToolCall): ToolCall[] =>
  (calls ?? []).map(map);

export const mapToolResults = <T>(
  results: T[] | undefined,
  map: (result: T) => ToolResult,
): ToolResult[] => (results ?? []).map(map);

// --- Stream Utils ---

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
