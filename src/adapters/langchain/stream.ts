import type { BaseMessageChunk } from "@langchain/core/messages";
import { AIMessageChunk, ToolMessageChunk } from "@langchain/core/messages";
import type {
  AdapterDiagnostic,
  ModelStreamEvent,
  ModelUsage,
  ToolCall,
  ToolResult,
} from "../types";
import { ModelUsageHelper } from "../modeling";

type StreamMeta = {
  id?: string;
  modelId?: string;
  timestamp?: number;
};

type StreamState = {
  started: boolean;
  lastMeta?: StreamMeta;
  lastChunk?: BaseMessageChunk;
  usageSeen: boolean;
};

const readString = (value: unknown) => (typeof value === "string" ? value : undefined);
const readNumber = (value: unknown) => (typeof value === "number" ? value : undefined);

const readUsage = (usage: unknown): ModelUsage | undefined => {
  const typed = usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  if (
    typed?.input_tokens === undefined &&
    typed?.output_tokens === undefined &&
    typed?.total_tokens === undefined
  ) {
    return undefined;
  }
  return {
    inputTokens: typed.input_tokens,
    outputTokens: typed.output_tokens,
    totalTokens: typed.total_tokens,
  };
};

const readStreamMeta = (chunk: BaseMessageChunk): StreamMeta | undefined => {
  const meta = (chunk as { response_metadata?: Record<string, unknown> }).response_metadata;
  if (!meta) {
    return undefined;
  }
  const id = readString(meta.id ?? meta.request_id);
  const modelId = readString(meta.model ?? meta.model_name);
  const created = readNumber(meta.created);
  const timestamp =
    typeof created === "number"
      ? created < 1_000_000_000_000
        ? created * 1000
        : created
      : undefined;
  if (!id && !modelId && timestamp === undefined) {
    return undefined;
  }
  return { id, modelId, timestamp };
};

const readTextPart = (entry: unknown) => {
  if (typeof entry === "string") {
    return entry;
  }
  if (typeof entry === "object" && entry && "text" in entry) {
    const text = (entry as { text?: string }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
};

const readTextDelta = (chunk: BaseMessageChunk) => {
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

const toToolCall = (chunk: { id?: string; name?: string; args?: string }) => {
  if (!chunk.name) {
    return undefined;
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

const readToolCalls = (chunk: BaseMessageChunk): ToolCall[] => {
  if (!AIMessageChunk.isInstance(chunk)) {
    return [];
  }
  const calls = chunk.tool_calls ?? [];
  if (calls.length > 0) {
    return calls.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.args ?? {},
    }));
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

const readToolResult = (chunk: BaseMessageChunk): ToolResult | undefined => {
  if (!isToolChunk(chunk)) {
    return undefined;
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

const readChunkType = (chunk: BaseMessageChunk) => {
  const typed = chunk as { type?: string; _getType?: () => string };
  return typed._getType?.() ?? typed.type;
};

const isToolChunk = (chunk: BaseMessageChunk) =>
  readChunkType(chunk) === "tool" && ToolMessageChunk.isInstance(chunk);

const toStartEvent = (meta?: StreamMeta): ModelStreamEvent => ({
  type: "start",
  id: meta?.id,
  modelId: meta?.modelId,
  timestamp: meta?.timestamp,
});

const toDeltaTextEvent = (text: string, chunk: BaseMessageChunk): ModelStreamEvent => ({
  type: "delta",
  text,
  raw: chunk,
});

const toDeltaToolCallEvent = (toolCall: ToolCall, chunk: BaseMessageChunk): ModelStreamEvent => ({
  type: "delta",
  toolCall,
  raw: chunk,
});

const toDeltaToolResultEvent = (
  toolResult: ToolResult,
  chunk: BaseMessageChunk,
): ModelStreamEvent => ({
  type: "delta",
  toolResult,
  raw: chunk,
});

const toUsageEvent = (usage: ModelUsage): ModelStreamEvent => ({
  type: "usage",
  usage,
});

const toEndEvent = (
  diagnostics: AdapterDiagnostic[] | undefined,
  meta?: StreamMeta,
  raw?: unknown,
): ModelStreamEvent => ({
  type: "end",
  diagnostics,
  raw,
  timestamp: meta?.timestamp,
});

const readUsageMetadata = (chunk: BaseMessageChunk) =>
  readUsage((chunk as { usage_metadata?: unknown }).usage_metadata);

const readToolEvents = (chunk: BaseMessageChunk) => {
  const events: ModelStreamEvent[] = [];
  const toolResults = readToolResult(chunk);
  if (toolResults) {
    events.push(toDeltaToolResultEvent(toolResults, chunk));
  }
  for (const toolCall of readToolCalls(chunk)) {
    events.push(toDeltaToolCallEvent(toolCall, chunk));
  }
  return events;
};

export type LangChainStreamOptions = {
  diagnostics?: AdapterDiagnostic[];
};

export const toLangChainStreamEvents = async function* (
  stream: AsyncIterable<BaseMessageChunk>,
  options?: LangChainStreamOptions,
): AsyncIterable<ModelStreamEvent> {
  const state: StreamState = { started: false, usageSeen: false };
  for await (const chunk of stream) {
    const meta = readStreamMeta(chunk);
    if (!state.started) {
      state.started = true;
      state.lastMeta = meta ?? state.lastMeta;
      yield toStartEvent(state.lastMeta);
    }
    state.lastMeta = meta ?? state.lastMeta;
    state.lastChunk = chunk;
    const text = readTextDelta(chunk);
    if (text) {
      yield toDeltaTextEvent(text, chunk);
    }
    const toolEvents = readToolEvents(chunk);
    for (const event of toolEvents) {
      yield event;
    }
    const usage = readUsageMetadata(chunk);
    if (usage) {
      state.usageSeen = true;
      yield toUsageEvent(usage);
    }
  }

  if (!state.usageSeen && options?.diagnostics) {
    ModelUsageHelper.warnIfMissing(options.diagnostics, undefined, "langchain");
  }
  yield toEndEvent(options?.diagnostics, state.lastMeta, state.lastChunk);
};
