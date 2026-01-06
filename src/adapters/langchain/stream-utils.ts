import type { BaseMessageChunk } from "@langchain/core/messages";
import { AIMessageChunk, ToolMessageChunk } from "@langchain/core/messages";
import type { ModelUsage, ToolCall, ToolResult } from "../types";
import { normalizeTimestamp } from "../model-utils";
import { readString, readNumber } from "../utils";

export type StreamMeta = {
  id?: string;
  modelId?: string;
  timestamp?: number;
};

export const readUsage = (usage: unknown): ModelUsage | null => {
  const typed = usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  if (
    typed?.input_tokens === undefined &&
    typed?.output_tokens === undefined &&
    typed?.total_tokens === undefined
  ) {
    return null;
  }
  return {
    inputTokens: typed.input_tokens ?? null,
    outputTokens: typed.output_tokens ?? null,
    totalTokens: typed.total_tokens ?? null,
  };
};

export const readStreamMeta = (chunk: BaseMessageChunk): StreamMeta | null => {
  const meta = (chunk as { response_metadata?: Record<string, unknown> }).response_metadata;
  if (!meta) {
    return null;
  }
  const id = readString(meta.id ?? meta.request_id);
  const modelId = readString(meta.model ?? meta.model_name);
  const created = readNumber(meta.created);
  const timestamp = typeof created === "number" ? normalizeTimestamp(created) : undefined;
  if (!id && !modelId && timestamp === undefined) {
    return null;
  }
  return { id: id ?? undefined, modelId: modelId ?? undefined, timestamp };
};

export const readTextPart = (entry: unknown) => {
  if (typeof entry === "string") {
    return entry;
  }
  if (typeof entry === "object" && entry && "text" in entry) {
    const text = (entry as { text?: string }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
};

export const readTextDelta = (chunk: BaseMessageChunk) => {
  const content = chunk.content as unknown;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content.map(readTextPart);
    return parts.join("");
  }
  return "";
};

export const toToolCall = (chunk: { id?: string; name?: string; args?: string }) => {
  if (!chunk.name) {
    return null;
  }
  let args: Record<string, unknown> = {};
  if (chunk.args) {
    try {
      args = JSON.parse(chunk.args) as Record<string, unknown>;
    } catch {
      args = {};
    }
  }
  return {
    id: chunk.id,
    name: chunk.name,
    arguments: args,
  };
};

export const readToolCalls = (chunk: BaseMessageChunk): ToolCall[] => {
  if (!AIMessageChunk.isInstance(chunk)) {
    return [];
  }
  const calls = chunk.tool_calls ?? [];
  if (calls.length > 0) {
    const mapped = calls
      .filter((call) => Boolean(call.name))
      .map((call) => ({
        id: call.id,
        name: call.name,
        arguments: call.args ?? {},
      }));
    if (mapped.length > 0) {
      return mapped;
    }
  }
  const results: ToolCall[] = [];
  const callChunks = chunk.tool_call_chunks ?? [];
  for (const callChunk of callChunks) {
    const call = mapToolCallChunk(callChunk);
    if (call) {
      results.push(call);
    }
  }
  return results;
};

const mapToolCallChunk = (callChunk: { id?: string; name?: string; args?: string }) =>
  toToolCall(callChunk);

export const readChunkType = (chunk: BaseMessageChunk) => {
  const typed = chunk as { type?: string; _getType?: () => string };
  return typed._getType?.() ?? typed.type;
};

export const isToolChunk = (chunk: BaseMessageChunk) =>
  readChunkType(chunk) === "tool" && ToolMessageChunk.isInstance(chunk);

export const readToolResult = (chunk: BaseMessageChunk): ToolResult | null => {
  if (!isToolChunk(chunk)) {
    return null;
  }
  const toolChunk = chunk as ToolMessageChunk;
  const content = readTextDelta(toolChunk);
  return {
    toolCallId: toolChunk.tool_call_id,
    name: "tool",
    result: content,
    isError: toolChunk.status === "error",
  };
};
