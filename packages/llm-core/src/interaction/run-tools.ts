import type { ToolCall, ToolResult } from "#adapters/types";
import type { Message, MessagePart } from "#adapters/types/messages";
import { bindFirst } from "#shared/fp";
import { isRecord } from "#shared/guards";
import { maybeChain, maybeMap, maybeTap } from "#shared/maybe";
import { executeToolCalls } from "#shared/tool-execution";
import type {
  InteractionContext,
  InteractionEvent,
  InteractionInput,
  InteractionState,
} from "./types";
import type { InteractionStepApply } from "./pipeline";
import { createMetaWithSequence, emitInteractionEventsForContext } from "./event-utils";
import type { InteractionReducer } from "./types";

const readMessageParts = (message: Message | null | undefined): MessagePart[] | null => {
  if (!message) {
    return null;
  }
  const content = message.content;
  if (!content || typeof content === "string") {
    return null;
  }
  if (!isRecord(content) || !Array.isArray(content.parts)) {
    return null;
  }
  return content.parts;
};

const readLastAssistantMessage = (messages: Message[]) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message && message.role === "assistant") {
      return message;
    }
  }
  return null;
};

const readToolResultIds = (parts: MessagePart[]) => {
  const ids = new Set<string>();
  for (const part of parts) {
    if (part.type === "tool-result" && typeof part.toolCallId === "string") {
      ids.add(part.toolCallId);
    }
  }
  return ids;
};

const toToolArguments = (value: unknown): Record<string, unknown> => {
  if (isRecord(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return {};
  }
  return { value };
};

const createToolCallFallbackId = (name: string, index: number) => `tool.${name}.${index}`;

const readToolCallsFromParts = (parts: MessagePart[] | null) => {
  const calls: ToolCall[] = [];
  if (!parts) {
    return calls;
  }
  const resultIds = readToolResultIds(parts);
  let index = 0;
  for (const part of parts) {
    if (part.type !== "tool-call") {
      continue;
    }
    const fallbackId = createToolCallFallbackId(part.toolName, index);
    const id = part.toolCallId ?? fallbackId;
    if (id && resultIds.has(id)) {
      index += 1;
      continue;
    }
    calls.push({
      id,
      name: part.toolName,
      arguments: toToolArguments(part.input),
    });
    index += 1;
  }
  return calls;
};

const readToolCallsFromState = (state: InteractionState) =>
  readToolCallsFromParts(readMessageParts(readLastAssistantMessage(state.messages)));

const toErrorText = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return "tool_execution_failed";
};

const createToolErrorResult = (call: ToolCall, error: unknown): ToolResult => ({
  name: call.name,
  toolCallId: call.id,
  isError: true,
  result: { error: "tool_error", message: toErrorText(error) },
});

const buildToolResultEvents = (input: {
  state: InteractionState;
  interactionInput: InteractionInput;
  sourceId: string;
  results: ToolResult[];
}) => {
  const events: InteractionEvent[] = [];
  let sequence = input.state.lastSequence ?? 0;
  sequence += 1;
  events.push({
    kind: "model",
    event: { type: "start" },
    meta: createMetaWithSequence(sequence, input.interactionInput, input.sourceId),
  });
  for (const result of input.results) {
    sequence += 1;
    events.push({
      kind: "model",
      event: { type: "delta", toolResult: result },
      meta: createMetaWithSequence(sequence, input.interactionInput, input.sourceId),
    });
  }
  sequence += 1;
  events.push({
    kind: "model",
    event: { type: "end" },
    meta: createMetaWithSequence(sequence, input.interactionInput, input.sourceId),
  });
  return events;
};

const toInteractionOutput = (output: InteractionState) => ({ output });

const emitToolEvents = (
  input: { context: InteractionContext; events: InteractionEvent[] },
  _state: InteractionState,
) => emitInteractionEventsForContext(input.context, input.events);

const reduceEventsWithReducer = (
  reducer: InteractionReducer,
  state: InteractionState,
  events: InteractionEvent[],
) => {
  let next = state;
  for (const event of events) {
    next = reducer(next, event);
  }
  return next;
};

const applyToolResultsToState = (input: {
  state: InteractionState;
  context: InteractionContext;
  interactionInput: InteractionInput;
  results: ToolResult[];
}) => {
  const events = buildToolResultEvents({
    state: input.state,
    interactionInput: input.interactionInput,
    sourceId: "model.primary",
    results: input.results,
  });
  const nextState = reduceEventsWithReducer(input.context.reducer, input.state, events);
  return maybeTap(bindFirst(emitToolEvents, { context: input.context, events }), nextState);
};

const applyToolExecutionResults = (
  input: {
    state: InteractionState;
    context: InteractionContext;
    interactionInput: InteractionInput;
  },
  results: ToolResult[],
) => {
  if (results.length === 0) {
    return input.state;
  }
  return applyToolResultsToState({ ...input, results });
};

export const applyRunTools: InteractionStepApply = (options) => {
  const calls = readToolCallsFromState(options.output);
  if (calls.length === 0) {
    return { output: options.output };
  }
  const tools = options.context.adapters?.tools ?? [];
  const executed = executeToolCalls({
    tools,
    calls,
    onError: createToolErrorResult,
  });
  return maybeMap(
    toInteractionOutput,
    maybeChain(
      bindFirst(applyToolExecutionResults, {
        state: options.output,
        context: options.context,
        interactionInput: options.input,
      }),
      executed,
    ),
  );
};
