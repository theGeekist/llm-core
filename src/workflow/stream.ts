import type {
  Model,
  ModelCall,
  ModelResult,
  ModelStreamEvent,
  ModelUsage,
  ToolCall,
  ToolResult,
  EventStream,
} from "#adapters/types";
import type { InteractionEvent, InteractionEventMeta } from "#interaction/types";
import { emitInteractionEvent } from "#interaction/transport";
import { maybeToAsyncIterable } from "#shared/maybe";
import { bindFirst } from "#shared/fp";

export type StreamingModelOptions = {
  model: Model;
  eventStream: EventStream;
  interactionId: string;
  correlationId: string;
  nextSequence: () => number;
  nextSourceId: () => string;
};

export type StreamingModelInteractionOptions = {
  model: Model;
  eventStream: EventStream;
  interactionId: string;
  correlationId: string;
  sourceIdPrefix?: string;
};

export const createStreamingModel = (options: StreamingModelOptions): Model => ({
  generate: bindFirst(runGenerate, options),
  stream: options.model.stream ? bindFirst(runStream, options) : undefined,
  metadata: options.model.metadata,
});

export const createStreamingModelForInteraction = (
  options: StreamingModelInteractionOptions,
): Model => createStreamingModel(toStreamingModelOptions(options));

const runStream = (options: StreamingModelOptions, call: ModelCall) =>
  options.model.stream ? options.model.stream(call) : toEmptyStream();

const runGenerate = async (
  options: StreamingModelOptions,
  call: ModelCall,
): Promise<ModelResult> => {
  if (!options.model.stream) {
    return options.model.generate(call);
  }
  if (call.responseSchema) {
    return options.model.generate(call);
  }

  const sourceId = options.nextSourceId();
  const iterable = await maybeToAsyncIterable(options.model.stream(call));
  const state = createStreamState();

  for await (const event of iterable) {
    if (event.type === "error") {
      if (shouldFallbackToGenerate(call, state)) {
        return options.model.generate(call);
      }
      await emitInteractionEvent(options.eventStream, toInteractionEvent(options, sourceId, event));
      throw event.error;
    }
    state.hasEvents = true;
    await emitInteractionEvent(options.eventStream, toInteractionEvent(options, sourceId, event));
    applyStreamEvent(state, event);
  }

  return toModelResult(state);
};

type StreamState = {
  text: string;
  reasoning: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  usage: ModelUsage | null;
  hasEvents: boolean;
};

const createStreamState = (): StreamState => ({
  text: "",
  reasoning: "",
  toolCalls: [],
  toolResults: [],
  usage: null,
  hasEvents: false,
});

const applyStreamEvent = (state: StreamState, event: ModelStreamEvent) => {
  if (event.type === "delta") {
    if (event.text) {
      state.text += event.text;
    }
    if (event.reasoning) {
      state.reasoning += event.reasoning;
    }
    if (event.toolCall) {
      state.toolCalls.push(event.toolCall);
    }
    if (event.toolResult) {
      state.toolResults.push(event.toolResult);
    }
    return;
  }
  if (event.type === "usage") {
    state.usage = event.usage;
  }
  if (event.type === "end" && event.text) {
    state.text += event.text;
  }
};

const toModelResult = (state: StreamState): ModelResult => ({
  text: state.text || null,
  toolCalls: state.toolCalls.length > 0 ? state.toolCalls : null,
  toolResults: state.toolResults.length > 0 ? state.toolResults : null,
  reasoning: state.reasoning || null,
  usage: state.usage,
});

const toInteractionEvent = (
  options: StreamingModelOptions,
  sourceId: string,
  event: ModelStreamEvent,
): InteractionEvent => ({
  kind: "model",
  event,
  meta: createMeta(options, sourceId),
});

const createMeta = (options: StreamingModelOptions, sourceId: string): InteractionEventMeta => ({
  sequence: options.nextSequence(),
  timestamp: Date.now(),
  sourceId,
  interactionId: options.interactionId,
  correlationId: options.correlationId,
});

const toEmptyStream = (): ModelStreamEvent[] => [];

const shouldFallbackToGenerate = (call: ModelCall, state: StreamState) =>
  !!call.responseSchema && !state.hasEvents;

type SequenceState = {
  current: number;
};

const incrementSequence = (state: SequenceState) => {
  state.current += 1;
  return state.current;
};

const createSequence = () => bindFirst(incrementSequence, { current: 0 });

const buildSourceId = (prefix: string, index: number) => `${prefix}.model.${index}`;

const readSourcePrefix = (options: StreamingModelInteractionOptions) =>
  options.sourceIdPrefix ?? options.interactionId;

const buildSourceIdWith = (input: { prefix: string; nextIndex: () => number }) =>
  buildSourceId(input.prefix, input.nextIndex());

const createNextSourceId = (prefix: string) =>
  bindFirst(buildSourceIdWith, { prefix, nextIndex: createSequence() });

const toStreamingModelOptions = (
  options: StreamingModelInteractionOptions,
): StreamingModelOptions => ({
  model: options.model,
  eventStream: options.eventStream,
  interactionId: options.interactionId,
  correlationId: options.correlationId,
  nextSequence: createSequence(),
  nextSourceId: createNextSourceId(readSourcePrefix(options)),
});
