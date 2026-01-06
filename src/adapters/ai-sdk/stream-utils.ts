import type { TextStreamPart, ToolSet } from "ai";
import type { ModelStreamEvent, ToolCall, ToolResult } from "../types";
import {
  toStreamDeltaTextEvent,
  toStreamDeltaToolCallEvent,
  toStreamDeltaToolResultEvent,
  toStreamErrorEvent,
  toStreamStartEvent,
} from "../stream-utils";

export const toToolCallFromPart = (part: TextStreamPart<ToolSet>): ToolCall | null => {
  if (part.type !== "tool-call") {
    return null;
  }
  return {
    id: part.toolCallId,
    name: part.toolName,
    arguments: (part.input ?? {}) as Record<string, unknown>,
  };
};

export const toToolResultFromPart = (part: TextStreamPart<ToolSet>): ToolResult | null => {
  if (part.type === "tool-result") {
    return {
      toolCallId: part.toolCallId,
      name: part.toolName,
      result: part.output,
    };
  }
  if (part.type === "tool-error") {
    return {
      toolCallId: part.toolCallId,
      name: part.toolName,
      result: part.error,
      isError: true,
    };
  }
  return null;
};

export const toEventFromPart = (part: TextStreamPart<ToolSet>): ModelStreamEvent => {
  const toolCall = toToolCallFromPart(part);
  if (toolCall) {
    return toStreamDeltaToolCallEvent(toolCall, part);
  }
  const toolResult = toToolResultFromPart(part);
  if (toolResult) {
    return toStreamDeltaToolResultEvent(toolResult, part);
  }

  if (part.type === "error") {
    return toStreamErrorEvent(part.error);
  }

  switch (part.type) {
    case "text-start":
    case "reasoning-start":
      return toStreamStartEvent({ id: "id" in part ? part.id : undefined });
    case "text-delta":
    case "reasoning-delta":
      return toStreamDeltaTextEvent("text" in part ? part.text : undefined, part);
    case "text-end":
    case "reasoning-end":
      return { type: "delta", raw: part };
    default:
      return { type: "delta", raw: part };
  }
};
