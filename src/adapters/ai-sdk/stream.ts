import type { TextStreamPart, ToolSet } from "ai";
import type { AdapterDiagnostic, ModelStreamEvent, ToolCall, ToolResult } from "../types";
import { toEventFromPart } from "./stream-utils";
import {
  toStreamDeltaToolCallEvent,
  toStreamDeltaToolResultEvent,
  toStreamErrorEvent,
  toStreamStartEvent,
} from "../stream-utils";

const isStartPart = (part: TextStreamPart<ToolSet>) =>
  part.type === "text-start" || part.type === "reasoning-start";

const isErrorPart = (part: TextStreamPart<ToolSet>) => part.type === "error";

const readPartId = (part: TextStreamPart<ToolSet>) => ("id" in part ? part.id : undefined);

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
    if (isStartPart(part) && started) {
      yield { type: "delta", raw: part };
      continue;
    }
    if (!started && !isStartPart(part) && !isErrorPart(part)) {
      started = true;
      yield toStreamStartEvent({ id: readPartId(part) });
    }
    if (isStartPart(part)) {
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
