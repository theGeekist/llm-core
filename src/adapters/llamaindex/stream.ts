import type { ChatResponseChunk, ToolCall as LlamaToolCall } from "@llamaindex/core/llms";
import type { AdapterDiagnostic, ModelStreamEvent, ModelUsage, ToolCall } from "../types";
import {
  toStreamDeltaTextEvent,
  toStreamDeltaToolCallEvent,
  toStreamEndEvent,
  toStreamStartEvent,
  toStreamUsageEvent,
} from "../stream-utils";
import { ModelUsageHelper } from "../modeling";
import { readNumber } from "../utils";

type StreamState = {
  started: boolean;
  lastRaw?: unknown;
  usageSeen: boolean;
};

export const readUsageValue = (value: unknown) => readNumber(value);

export const readUsagePayload = (raw: unknown) => {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const usage = (raw as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }
  return usage as {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export const toUsage = (raw: unknown): ModelUsage | undefined => {
  const usage = readUsagePayload(raw);
  if (!usage) {
    return undefined;
  }
  const inputTokens = readUsageValue(usage.inputTokens ?? usage.input_tokens);
  const outputTokens = readUsageValue(usage.outputTokens ?? usage.output_tokens);
  const totalTokens = readUsageValue(usage.totalTokens ?? usage.total_tokens);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }
  return { inputTokens, outputTokens, totalTokens };
};

export const toToolCall = (call: LlamaToolCall): ToolCall => ({
  id: call.id,
  name: call.name,
  arguments: call.input,
});

const toToolCallEvent = (toolCall: ToolCall): ModelStreamEvent =>
  toStreamDeltaToolCallEvent(toolCall);

export type LlamaIndexStreamOptions = {
  diagnostics?: AdapterDiagnostic[];
  toolCalls?: LlamaToolCall[];
};

export const readToolEvents = (toolCalls: LlamaToolCall[] | undefined) => {
  if (!toolCalls || toolCalls.length === 0) {
    return [];
  }
  return toolCalls.map(mapToolCall);
};

export const mapToolCall = (call: LlamaToolCall) => toToolCallEvent(toToolCall(call));

export const toLlamaIndexStreamEvents = async function* (
  stream: AsyncIterable<ChatResponseChunk>,
  options?: LlamaIndexStreamOptions,
): AsyncIterable<ModelStreamEvent> {
  const state: StreamState = { started: false, usageSeen: false };
  for await (const chunk of stream) {
    if (!state.started) {
      state.started = true;
      yield toStreamStartEvent();
    }
    state.lastRaw = chunk;
    if (chunk.delta) {
      yield toStreamDeltaTextEvent(chunk.delta, chunk.raw);
    }
    const usage = toUsage(chunk.raw);
    if (usage) {
      state.usageSeen = true;
      yield toStreamUsageEvent(usage);
    }
  }
  if (!state.usageSeen && options?.diagnostics) {
    ModelUsageHelper.warnIfMissing(options.diagnostics, undefined, "llamaindex");
  }
  for (const event of readToolEvents(options?.toolCalls)) {
    yield event;
  }
  yield toStreamEndEvent(options?.diagnostics, undefined, state.lastRaw);
};
