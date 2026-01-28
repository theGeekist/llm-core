import type { ChatResponseChunk, ToolCall as LlamaToolCall } from "@llamaindex/core/llms";
import type { AdapterDiagnostic, ModelStreamEvent, ToolCall } from "../types";
import {
  toStreamDeltaTextEvent,
  toStreamDeltaToolCallEvent,
  toStreamEndEvent,
  toStreamStartEvent,
  toStreamUsageEvent,
} from "../utils";
import { ModelUsageHelper } from "../modeling";
import { toUsage } from "./model-utils";

type StreamState = {
  started: boolean;
  lastRaw?: unknown;
  usageSeen: boolean;
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
