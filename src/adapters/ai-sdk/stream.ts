import type { TextStreamPart, ToolSet } from "ai";
import type { AdapterDiagnostic, ModelStreamEvent, ToolCall, ToolResult } from "../types";
import { toEventFromPart } from "./stream-utils";
import {
  toStreamDeltaToolCallEvent,
  toStreamDeltaToolResultEvent,
  toStreamErrorEvent,
} from "../stream-utils";

export const toToolCallEvent = (toolCall?: ToolCall): ModelStreamEvent | null => {
  if (!toolCall) {
    return null;
  }
  return toStreamDeltaToolCallEvent(toolCall);
};

export const toToolResultEvent = (toolResult?: ToolResult): ModelStreamEvent | null => {
  if (!toolResult) {
    return null;
  }
  return toStreamDeltaToolResultEvent(toolResult);
};

export const toModelStreamEvents = async function* (
  parts: AsyncIterable<TextStreamPart<ToolSet>>,
  options?: {
    toolCall?: ToolCall;
    toolResult?: ToolResult;
    diagnostics?: AdapterDiagnostic[];
  },
): AsyncIterable<ModelStreamEvent> {
  let started = false;
  for await (const part of parts) {
    if ((part.type === "text-start" || part.type === "reasoning-start") && started) {
      yield { type: "delta", raw: part };
      continue;
    }
    if (part.type === "text-start" || part.type === "reasoning-start") {
      started = true;
    }
    yield toEventFromPart(part);
  }

  const toolCallEvent = toToolCallEvent(options?.toolCall);
  if (toolCallEvent) {
    yield toolCallEvent;
  }

  const toolResultEvent = toToolResultEvent(options?.toolResult);
  if (toolResultEvent) {
    yield toolResultEvent;
  }
};

export const toStreamErrorEvents = async function* (
  error: unknown,
  diagnostics?: AdapterDiagnostic[],
): AsyncIterable<ModelStreamEvent> {
  yield toStreamErrorEvent(error, diagnostics);
};
