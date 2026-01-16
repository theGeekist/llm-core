import type {
  AssistantStream,
  AssistantStreamController,
  ToolCallStreamController,
} from "assistant-stream";
import { createAssistantStreamController } from "assistant-stream";
import type { ReadonlyJSONObject, ReadonlyJSONValue } from "assistant-stream/utils";
import type { EventStream, EventStreamEvent, ModelStreamEvent } from "../types";
import type { InteractionEvent, InteractionEventMeta } from "../../interaction/types";
import { isRecord } from "#shared/guards";
import { maybeChain, maybeMap, type MaybePromise } from "#shared/maybe";
import { bindFirst, toTrue } from "#shared/fp";

export type AssistantUiStreamOptions = {
  includeReasoning?: boolean;
  errorPrefix?: string;
};

export type AssistantUiStreamAdapter = {
  stream: AssistantStream;
  eventStream: EventStream;
  controller: AssistantStreamController;
};

type AssistantStreamAction =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-call";
      key: string;
      toolName: string;
      toolCallId?: string | null;
      args: ReadonlyJSONObject;
    }
  | {
      type: "tool-result";
      key: string;
      toolName: string;
      toolCallId?: string | null;
      result: unknown;
      isError?: boolean | null;
    }
  | { type: "error"; error: unknown }
  | { type: "close" };

type AssistantUiStreamState = {
  controller: AssistantStreamController;
  options: AssistantUiStreamOptions;
  toolCalls: Map<string, ToolCallStreamController>;
};

type ModelDeltaEvent = Extract<ModelStreamEvent, { type: "delta" }>;

const DEFAULT_ERROR_PREFIX = "Error: ";

const toErrorText = (error: unknown, prefix?: string) => {
  const resolvedPrefix = prefix ?? DEFAULT_ERROR_PREFIX;
  if (error instanceof Error) {
    return `${resolvedPrefix}${error.message}`;
  }
  if (typeof error === "string") {
    return `${resolvedPrefix}${error}`;
  }
  try {
    return `${resolvedPrefix}${JSON.stringify(error)}`;
  } catch {
    return `${resolvedPrefix}Unknown error`;
  }
};

const toToolKey = (meta: InteractionEventMeta, toolName: string, toolCallId?: string | null) => {
  if (toolCallId) {
    return toolCallId;
  }
  return `${meta.sourceId}:${toolName}:${meta.sequence}`;
};

class AssistantUiStreamEventStream implements EventStream {
  private state: AssistantUiStreamState;

  constructor(state: AssistantUiStreamState) {
    this.state = state;
  }

  emit(event: EventStreamEvent) {
    const interactionEvent = toInteractionEvent(event);
    if (!interactionEvent) {
      return null;
    }
    const actions = mapInteractionEvent(this.state, interactionEvent);
    return runActionSequence(this.state, actions);
  }

  emitMany(events: EventStreamEvent[]) {
    const actions: AssistantStreamAction[] = [];
    for (const event of events) {
      const interactionEvent = toInteractionEvent(event);
      if (!interactionEvent) {
        continue;
      }
      appendActions(actions, mapInteractionEvent(this.state, interactionEvent));
    }
    return runActionSequence(this.state, actions);
  }
}

export const createAssistantUiInteractionStream = (
  options?: AssistantUiStreamOptions,
): AssistantUiStreamAdapter => {
  const [stream, controller] = createAssistantStreamController();
  const state: AssistantUiStreamState = {
    controller,
    options: options ?? {},
    toolCalls: new Map<string, ToolCallStreamController>(),
  };
  return {
    stream,
    controller,
    eventStream: new AssistantUiStreamEventStream(state),
  };
};

const mapInteractionEvent = (state: AssistantUiStreamState, event: InteractionEvent) => {
  if (event.kind !== "model") {
    return [];
  }
  return mapModelEvent(state, event);
};

const mapModelEvent = (
  state: AssistantUiStreamState,
  event: InteractionEvent & { kind: "model" },
) => {
  const streamEvent = event.event;
  if (streamEvent.type === "start") {
    resetToolCalls(state);
    return [];
  }

  if (streamEvent.type === "delta") {
    return mapDeltaEvent(state, streamEvent, event.meta);
  }

  if (streamEvent.type === "end") {
    return mapEndEvent(streamEvent);
  }

  if (streamEvent.type === "error") {
    return [toErrorAction(streamEvent.error), toCloseAction()];
  }

  return [];
};

const mapDeltaEvent = (
  state: AssistantUiStreamState,
  delta: ModelDeltaEvent,
  meta: InteractionEventMeta,
) => {
  const actions: AssistantStreamAction[] = [];

  if (delta.text) {
    actions.push(toTextAction(delta.text));
  }

  if (delta.reasoning && state.options.includeReasoning) {
    actions.push(toReasoningAction(delta.reasoning));
  }

  if (delta.toolCall) {
    const key = toToolKey(meta, delta.toolCall.name, delta.toolCall.id ?? null);
    actions.push({
      type: "tool-call",
      key,
      toolName: delta.toolCall.name,
      toolCallId: delta.toolCall.id,
      args: toReadonlyJsonObject(delta.toolCall.arguments),
    });
  }

  if (delta.toolResult) {
    const key = toToolKey(meta, delta.toolResult.name, delta.toolResult.toolCallId ?? null);
    actions.push({
      type: "tool-result",
      key,
      toolName: delta.toolResult.name,
      toolCallId: delta.toolResult.toolCallId,
      result: delta.toolResult.result,
      isError: delta.toolResult.isError,
    });
  }

  return actions;
};

const mapEndEvent = (event: Extract<ModelStreamEvent, { type: "end" }>) => {
  const actions: AssistantStreamAction[] = [];
  if (event.text) {
    actions.push(toTextAction(event.text));
  }
  actions.push(toCloseAction());
  return actions;
};

const resetToolCalls = (state: AssistantUiStreamState) => {
  state.toolCalls.clear();
};

const runActionSequence = async (
  state: AssistantUiStreamState,
  actions: AssistantStreamAction[],
): Promise<boolean | null> => {
  if (actions.length === 0) {
    return null;
  }
  let hasTrue = false;
  let hasFalse = false;
  for (const action of actions) {
    try {
      const result = await applyAction(state, action);
      if (result === true) {
        hasTrue = true;
      } else if (result === false) {
        hasFalse = true;
      }
    } catch {
      hasFalse = true;
    }
  }
  if (hasFalse) {
    return false;
  }
  if (hasTrue) {
    return true;
  }
  return null;
};

const applyAction = (
  state: AssistantUiStreamState,
  action: AssistantStreamAction,
): MaybePromise<boolean | null> => {
  switch (action.type) {
    case "text":
      state.controller.appendText(action.text);
      return true;
    case "reasoning":
      state.controller.appendReasoning(action.text);
      return true;
    case "tool-call":
      return applyToolCall(state, action);
    case "tool-result":
      return applyToolResult(state, action);
    case "error":
      state.controller.enqueue({
        type: "error",
        path: [],
        error: toErrorText(action.error, state.options.errorPrefix),
      });
      return true;
    case "close":
      state.controller.close();
      resetToolCalls(state);
      return true;
    default:
      return null;
  }
};

const applyToolCall = (
  state: AssistantUiStreamState,
  action: Extract<AssistantStreamAction, { type: "tool-call" }>,
) => {
  if (state.toolCalls.has(action.key)) {
    return null;
  }
  const controller = state.controller.addToolCallPart({
    toolName: action.toolName,
    toolCallId: action.toolCallId ?? undefined,
    args: action.args,
  });
  state.toolCalls.set(action.key, controller);
  return true;
};

const applyToolResult = (
  state: AssistantUiStreamState,
  action: Extract<AssistantStreamAction, { type: "tool-result" }>,
) => {
  const controller = readOrCreateToolCall(state, action);
  const response = {
    result: toReadonlyJsonValue(action.result),
    isError: action.isError ?? false,
  };
  return maybeChain(bindFirst(finishToolCall, controller), controller.setResponse(response));
};

const finishToolCall = (controller: ToolCallStreamController) =>
  maybeMap(toTrue, controller.close());

const readOrCreateToolCall = (
  state: AssistantUiStreamState,
  action: Extract<AssistantStreamAction, { type: "tool-result" }>,
) => {
  const existing = state.toolCalls.get(action.key);
  if (existing) {
    return existing;
  }
  const controller = state.controller.addToolCallPart({
    toolName: action.toolName,
    toolCallId: action.toolCallId ?? undefined,
  });
  state.toolCalls.set(action.key, controller);
  return controller;
};

const appendActions = (target: AssistantStreamAction[], source: AssistantStreamAction[]) => {
  for (const action of source) {
    target.push(action);
  }
};

const toTextAction = (text: string): AssistantStreamAction => ({ type: "text", text });

const toReasoningAction = (text: string): AssistantStreamAction => ({ type: "reasoning", text });

const toErrorAction = (error: unknown): AssistantStreamAction => ({ type: "error", error });

const toCloseAction = (): AssistantStreamAction => ({ type: "close" });

const toReadonlyJsonObject = (value: Record<string, unknown>): ReadonlyJSONObject =>
  value as ReadonlyJSONObject;

const toReadonlyJsonValue = (value: unknown): ReadonlyJSONValue => value as ReadonlyJSONValue;

const toInteractionEvent = (event: EventStreamEvent): InteractionEvent | null => {
  if (!event.data || !isRecord(event.data)) {
    return null;
  }
  const candidate = event.data.event;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return candidate as InteractionEvent;
};
