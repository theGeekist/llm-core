import type { Model, ModelCall, ModelResult, ModelStreamEvent } from "../adapters/types";
import type { Message } from "../adapters/types/messages";
import { bindFirst, maybeChain, maybeMap, maybeTap, maybeToStep, maybeTry } from "../maybe";
import type { MaybeAsyncIterable, MaybePromise, Step } from "../maybe";
import type { PipelinePaused } from "@wpkernel/pipeline/core";
import { emitInteractionEvent, emitInteractionEvents } from "./transport";
import {
  createInteractionPipeline,
  createInteractionReducer,
  createInteractionStep,
  type InteractionStepApply,
} from "./pipeline";
import type {
  InteractionContext,
  InteractionEvent,
  InteractionEventMeta,
  InteractionInput,
  InteractionPauseRequest,
  InteractionRunOutcome,
  InteractionRunOptions,
  InteractionState,
} from "./types";
import { reduceInteractionEvent, reduceInteractionEvents } from "./reducer";

export type InteractionStepSpec = {
  name: string;
  apply: InteractionStepApply;
  dependsOn?: readonly string[];
  mode?: import("@wpkernel/pipeline/core").HelperMode;
  priority?: number;
  origin?: string;
};

export type InteractionStepPack = {
  name: string;
  steps: InteractionStepSpec[];
};

type PipelineUse = { use: (helper: unknown) => void };

const normalizeStepKey = (packName: string, stepName: string) =>
  stepName.includes(".") ? stepName : `${packName}.${stepName}`;

const normalizeDependency = (packName: string, dependency: string) =>
  dependency.includes(".") ? dependency : `${packName}.${dependency}`;

const normalizeDependencies = (packName: string, dependencies: readonly string[]) =>
  dependencies.map((dep) => normalizeDependency(packName, dep));

const compareStepSpec = (
  packName: string,
  left: InteractionStepSpec,
  right: InteractionStepSpec,
) => {
  const leftKey = normalizeStepKey(packName, left.name);
  const rightKey = normalizeStepKey(packName, right.name);
  return leftKey.localeCompare(rightKey);
};

const sortSteps = (packName: string, steps: InteractionStepSpec[]) =>
  [...steps].sort(bindFirst(compareStepSpec, packName));

const useHelper = (pipeline: unknown, helper: unknown) => {
  (pipeline as PipelineUse).use(helper);
};

const createHelperForStep = (packName: string, spec: InteractionStepSpec) => {
  const key = normalizeStepKey(packName, spec.name);
  const dependsOn = normalizeDependencies(packName, spec.dependsOn ?? []);
  return createInteractionStep({
    key,
    apply: spec.apply,
    dependsOn,
    mode: spec.mode,
    priority: spec.priority,
    origin: spec.origin,
  });
};

export const registerInteractionPack = (pipeline: unknown, pack: InteractionStepPack) => {
  for (const step of sortSteps(pack.name, pack.steps)) {
    useHelper(pipeline, createHelperForStep(pack.name, step));
  }
};

const toDefaultMessage = (input?: InteractionInput): Message | undefined => input?.message;

const appendMessage = (state: InteractionState, message: Message) => ({
  ...state,
  messages: [...state.messages, message],
});

const assignInteractionState = (target: InteractionState, source: InteractionState) => {
  target.messages = source.messages;
  target.diagnostics = source.diagnostics;
  target.trace = source.trace;
  target.events = source.events;
  target.lastSequence = source.lastSequence;
  target.private = source.private;
  return target;
};

function mergeInteractionPrivate(
  state: InteractionState,
  update: NonNullable<InteractionState["private"]>,
) {
  const base = state.private ?? {};
  return { ...state, private: { ...base, ...update } };
}

export function requestInteractionPause(pause: InteractionPauseRequest, state: InteractionState) {
  return mergeInteractionPrivate(state, { pause });
}

const toModelCall = (state: InteractionState): ModelCall => ({
  messages: state.messages,
});

const readMessageText = (message: Message): string | undefined => {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content.text;
};

const readResultText = (result: ModelResult): string | null => {
  if (result.text !== undefined) {
    return result.text;
  }
  if (!result.messages || result.messages.length === 0) {
    return null;
  }
  const last = result.messages[result.messages.length - 1];
  return (last ? readMessageText(last) : null) ?? null;
};

const createMeta = (
  state: InteractionState,
  input: InteractionInput,
  sourceId: string,
): InteractionEventMeta => ({
  sequence: (state.lastSequence ?? 0) + 1,
  timestamp: Date.now(),
  sourceId,
  correlationId: input.correlationId,
  interactionId: input.interactionId,
});

const createMetaWithSequence = (
  sequence: number,
  input: InteractionInput,
  sourceId: string,
): InteractionEventMeta => ({
  sequence,
  timestamp: Date.now(),
  sourceId,
  correlationId: input.correlationId,
  interactionId: input.interactionId,
});

const reduceInteraction = (
  state: InteractionState,
  context: InteractionContext,
  event: InteractionEvent,
) => context.reducer(state, event);

const emitInteractionTap = (
  context: InteractionContext,
  event: InteractionEvent,
  _state: InteractionState,
) => emitInteraction(context, event);

const emitInteractionEventsForContext = (
  context: InteractionContext,
  events: InteractionEvent[],
) => {
  if (!context.eventStream) {
    return null;
  }
  return emitInteractionEvents(context.eventStream, events);
};

const emitInteractionEventsTap = (
  context: InteractionContext,
  events: InteractionEvent[],
  _state: InteractionState,
) => emitInteractionEventsForContext(context, events);

const bindInteractionTap = (context: InteractionContext, event: InteractionEvent) =>
  bindFirst(bindFirst(emitInteractionTap, context), event);

const bindInteractionEventsTap = (context: InteractionContext, events: InteractionEvent[]) =>
  bindFirst(bindFirst(emitInteractionEventsTap, context), events);

const reduceAndEmitInteraction = (
  state: InteractionState,
  context: InteractionContext,
  event: InteractionEvent,
) => maybeTap(bindInteractionTap(context, event), reduceInteraction(state, context, event));

const emitInteraction = (context: InteractionContext, event: InteractionEvent) => {
  if (!context.eventStream) {
    return null;
  }
  return emitInteractionEvent(context.eventStream, event);
};

const reduceAndEmitInteractionEvents = (
  state: InteractionState,
  context: InteractionContext,
  events: InteractionEvent[],
) => maybeTap(bindInteractionEventsTap(context, events), state);

const isString = (value: unknown): value is string => typeof value === "string";

const pushModelDeltaEvent = (
  events: ModelStreamEvent[],
  event: Extract<ModelStreamEvent, { type: "delta" }>,
) => {
  events.push(event);
  return events;
};

const pushToolCallEvents = (events: ModelStreamEvent[], calls?: ModelResult["toolCalls"]) => {
  if (!calls || calls.length === 0) {
    return events;
  }
  for (const call of calls) {
    pushModelDeltaEvent(events, { type: "delta", toolCall: call });
  }
  return events;
};

const pushToolResultEvents = (events: ModelStreamEvent[], results?: ModelResult["toolResults"]) => {
  if (!results || results.length === 0) {
    return events;
  }
  for (const result of results) {
    pushModelDeltaEvent(events, { type: "delta", toolResult: result });
  }
  return events;
};

const toModelStreamEvents = (result: ModelResult): ModelStreamEvent[] => {
  const events: ModelStreamEvent[] = [];
  events.push({ type: "start" });
  const text = readResultText(result);
  if (text) {
    pushModelDeltaEvent(events, { type: "delta", text });
  }
  if (isString(result.reasoning)) {
    pushModelDeltaEvent(events, { type: "delta", reasoning: result.reasoning });
  }
  pushToolCallEvents(events, result.toolCalls);
  pushToolResultEvents(events, result.toolResults);
  events.push({ type: "end", diagnostics: result.diagnostics ?? undefined });
  return events;
};

type InteractionEventsInput = {
  state: InteractionState;
  input: InteractionInput;
  sourceId: string;
  events: ModelStreamEvent[];
  raw?: unknown;
};

const toInteractionEvents = (input: InteractionEventsInput): InteractionEvent[] => {
  const items: InteractionEvent[] = [];
  let sequence = input.state.lastSequence ?? 0;
  for (const event of input.events) {
    sequence += 1;
    items.push({
      kind: "model",
      event,
      meta: createMetaWithSequence(sequence, input.input, input.sourceId),
    });
  }
  if (input.raw !== undefined) {
    sequence += 1;
    items.push({
      kind: "event-stream",
      event: { name: "interaction.model.result", data: { raw: input.raw } },
      meta: createMetaWithSequence(sequence, input.input, "model.result"),
    });
  }
  return items;
};

const toInteractionOutput = (
  options: { output: InteractionState },
  nextState: InteractionState,
) => ({
  output: assignInteractionState(options.output, nextState),
});

const handleModelResult = (
  input: {
    state: InteractionState;
    context: InteractionContext;
    interactionInput: InteractionInput;
    sourceId: string;
  },
  result: ModelResult,
) => {
  const events = toInteractionEvents({
    state: input.state,
    input: input.interactionInput,
    sourceId: input.sourceId,
    events: toModelStreamEvents(result),
    raw: result.raw,
  });
  const nextState = reduceInteractionEvents(input.state, events);
  return reduceAndEmitInteractionEvents(nextState, input.context, events);
};

const handleModelStream = (
  input: {
    state: InteractionState;
    context: InteractionContext;
    interactionInput: InteractionInput;
    sourceId: string;
  },
  stream: Step<ModelStreamEvent>,
) =>
  applyModelStream({
    state: input.state,
    context: input.context,
    interactionInput: input.interactionInput,
    sourceId: input.sourceId,
    stream,
  });

type ApplyModelStreamInput = {
  state: InteractionState;
  context: InteractionContext;
  interactionInput: InteractionInput;
  sourceId: string;
  stream: Step<import("../adapters/types").ModelStreamEvent>;
};

const readStepNext = <T>(step: Step<T>) => step.next();

const applyModelStreamLoop = (input: ApplyModelStreamInput): MaybePromise<InteractionState> =>
  maybeChain(bindFirst(applyModelStreamResult, input), readStepNext(input.stream));

const applyModelStreamResult = (
  input: ApplyModelStreamInput,
  result: IteratorResult<ModelStreamEvent>,
): MaybePromise<InteractionState> => {
  if (result.done) {
    return input.state;
  }
  const meta = createMeta(input.state, input.interactionInput, input.sourceId);
  const event: InteractionEvent = { kind: "model", event: result.value, meta };
  return maybeChain(
    bindFirst(applyModelStreamContinue, input),
    reduceAndEmitInteraction(input.state, input.context, event),
  );
};

const applyModelStreamContinue = (
  input: ApplyModelStreamInput,
  nextState: InteractionState,
): MaybePromise<InteractionState> =>
  applyModelStreamLoop({
    state: nextState,
    context: input.context,
    interactionInput: input.interactionInput,
    sourceId: input.sourceId,
    stream: input.stream,
  });

const applyModelStreamError = (
  input: ApplyModelStreamInput,
  error: unknown,
): MaybePromise<InteractionState> => {
  const meta = createMeta(input.state, input.interactionInput, input.sourceId);
  const event: InteractionEvent = { kind: "model", event: { type: "error", error }, meta };
  return reduceAndEmitInteraction(input.state, input.context, event);
};

const applyModelStream = (input: ApplyModelStreamInput): MaybePromise<InteractionState> =>
  maybeTry(bindFirst(applyModelStreamError, input), bindFirst(applyModelStreamLoop, input));

type ApplyModelGenerateInput = {
  state: InteractionState;
  context: InteractionContext;
  interactionInput: InteractionInput;
  model: Model;
  call: ModelCall;
};

const applyModelGenerate = (input: ApplyModelGenerateInput) => {
  const run = bindFirst(handleModelResult, {
    state: input.state,
    context: input.context,
    interactionInput: input.interactionInput,
    sourceId: "model.primary",
  });
  return maybeChain(run, input.model.generate(input.call));
};

const hasStream = (
  model: Model,
): model is Model & {
  stream: (call: ModelCall) => MaybeAsyncIterable<import("../adapters/types").ModelStreamEvent>;
} => typeof model.stream === "function";

const applyRunModelCore = (
  state: InteractionState,
  context: InteractionContext,
  input: InteractionInput,
) => {
  const model = context.adapters?.model;
  if (!model) {
    return state;
  }
  const call = toModelCall(state);
  if (hasStream(model)) {
    const run = bindFirst(handleModelStream, {
      state,
      context,
      interactionInput: input,
      sourceId: "model.primary",
    });
    return maybeChain(run, maybeToStep(model.stream(call)));
  }
  return applyModelGenerate({
    state,
    context,
    interactionInput: input,
    model,
    call,
  });
};

export const applyCaptureInput: InteractionStepApply = (options) => {
  const message = toDefaultMessage(options.input);
  if (!message) {
    return { output: options.output };
  }
  const nextState = appendMessage(options.output, message);
  return { output: assignInteractionState(options.output, nextState) };
};

export const applyRunModel: InteractionStepApply = (options) =>
  maybeMap(
    bindFirst(toInteractionOutput, options),
    applyRunModelCore(options.output, options.context, options.input),
  );

export const applyRunTools: InteractionStepApply = (options) => {
  void options;
  return { output: options.output };
};

export const InteractionCorePack: InteractionStepPack = {
  name: "interaction-core",
  steps: [
    {
      name: "capture-input",
      apply: applyCaptureInput,
    },
    {
      name: "run-model",
      apply: applyRunModel,
      dependsOn: ["capture-input"],
    },
    {
      name: "run-tools",
      apply: applyRunTools,
      dependsOn: ["run-model"],
    },
  ],
};

export const createInteractionPipelineWithDefaults = () => {
  const pipeline = createInteractionPipeline();
  registerInteractionPack(pipeline, InteractionCorePack);
  return pipeline;
};

export const createInteractionReducerWithDefaults = () =>
  createInteractionReducer(reduceInteractionEvent);

export const runInteractionPipeline = (pipeline: unknown, options: InteractionRunOptions) => {
  const runner = pipeline as {
    run: (opts: InteractionRunOptions) => MaybePromise<InteractionRunOutcome>;
    resume?: (
      snapshot: PipelinePaused<Record<string, unknown>>["snapshot"],
      resumeInput?: unknown,
    ) => MaybePromise<InteractionRunOutcome>;
  };
  return runner.run(options);
};
