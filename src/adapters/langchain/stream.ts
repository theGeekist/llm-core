import type { BaseMessageChunk } from "@langchain/core/messages";
import type { AdapterDiagnostic, ModelStreamEvent } from "../types";
import type { StreamMeta } from "./stream-utils";
import {
  readStreamMeta,
  readTextDelta,
  readToolCalls,
  readToolResult,
  readUsage,
} from "./stream-utils";
import {
  toStreamDeltaTextEvent,
  toStreamDeltaToolCallEvent,
  toStreamDeltaToolResultEvent,
  toStreamEndEvent,
  toStreamStartEvent,
  toStreamUsageEvent,
} from "../stream-utils";
import { ModelUsageHelper } from "../modeling";

type StreamState = {
  started: boolean;
  lastMeta?: StreamMeta;
  lastChunk?: BaseMessageChunk;
  usageSeen: boolean;
};

const readUsageMetadata = (chunk: BaseMessageChunk) =>
  readUsage((chunk as { usage_metadata?: unknown }).usage_metadata);

const readToolEvents = (chunk: BaseMessageChunk) => {
  const events: ModelStreamEvent[] = [];
  const toolResults = readToolResult(chunk);
  if (toolResults) {
    events.push(toStreamDeltaToolResultEvent(toolResults, chunk));
  }
  for (const toolCall of readToolCalls(chunk)) {
    events.push(toStreamDeltaToolCallEvent(toolCall, chunk));
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
      yield toStreamStartEvent(state.lastMeta);
    }
    state.lastMeta = meta ?? state.lastMeta;
    state.lastChunk = chunk;
    const text = readTextDelta(chunk);
    if (text) {
      yield toStreamDeltaTextEvent(text, chunk);
    }
    const toolEvents = readToolEvents(chunk);
    for (const event of toolEvents) {
      yield event;
    }
    const usage = readUsageMetadata(chunk);
    if (usage) {
      state.usageSeen = true;
      yield toStreamUsageEvent(usage);
    }
  }

  if (!state.usageSeen && options?.diagnostics) {
    ModelUsageHelper.warnIfMissing(options.diagnostics, undefined, "langchain");
  }
  yield toStreamEndEvent(options?.diagnostics, state.lastMeta, state.lastChunk);
};
