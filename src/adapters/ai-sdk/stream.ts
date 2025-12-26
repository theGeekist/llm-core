import type { TextStreamPart, ToolSet } from "ai";
import type { AdapterDiagnostic, ModelStreamEvent, ToolCall, ToolResult } from "../types";

const toStartEvent = (part: TextStreamPart<ToolSet>): ModelStreamEvent => ({
  type: "start",
  id: "id" in part ? part.id : undefined,
});

const toDeltaEvent = (part: TextStreamPart<ToolSet>): ModelStreamEvent => ({
  type: "delta",
  text: "text" in part ? part.text : undefined,
  raw: part,
});

const toErrorEvent = (error: unknown, diagnostics?: AdapterDiagnostic[]): ModelStreamEvent => ({
  type: "error",
  error,
  diagnostics,
});

const toToolCallEvent = (toolCall?: ToolCall): ModelStreamEvent | undefined => {
  if (!toolCall) {
    return undefined;
  }
  return { type: "delta", toolCall };
};

const toToolResultEvent = (toolResult?: ToolResult): ModelStreamEvent | undefined => {
  if (!toolResult) {
    return undefined;
  }
  return { type: "delta", toolResult };
};

const toToolCallFromPart = (part: TextStreamPart<ToolSet>): ToolCall | undefined => {
  if (part.type !== "tool-call") {
    return undefined;
  }
  return {
    id: part.toolCallId,
    name: part.toolName,
    arguments: (part.input ?? {}) as Record<string, unknown>,
  };
};

const toToolResultFromPart = (part: TextStreamPart<ToolSet>): ToolResult | undefined => {
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
  return undefined;
};

const toEventFromPart = (part: TextStreamPart<ToolSet>): ModelStreamEvent => {
  const toolCall = toToolCallFromPart(part);
  if (toolCall) {
    return { type: "delta", toolCall, raw: part };
  }
  const toolResult = toToolResultFromPart(part);
  if (toolResult) {
    return { type: "delta", toolResult, raw: part };
  }

  if (part.type === "error") {
    return toErrorEvent(part.error);
  }

  switch (part.type) {
    case "text-start":
    case "reasoning-start":
      return toStartEvent(part);
    case "text-delta":
    case "reasoning-delta":
      return toDeltaEvent(part);
    case "text-end":
    case "reasoning-end":
      return { type: "delta", raw: part };
    default:
      return { type: "delta", raw: part };
  }
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
  yield toErrorEvent(error, diagnostics);
};
