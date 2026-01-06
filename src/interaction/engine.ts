import { createInteractionPipelineWithDefaults, runInteractionPipeline } from "./steps";
import type { AdapterBundle, EventStream, Message } from "../adapters/types";
import type {
  InteractionEvent,
  InteractionReducer,
  InteractionRunOptions,
  InteractionRunOutcome,
  InteractionState,
} from "./types";
import type { PipelinePaused, PipelineReporter } from "@wpkernel/pipeline/core";
import { bindFirst, maybeMap } from "../maybe";

export type InteractionEngineConfig = {
  adapters?: AdapterBundle;
  eventStream?: EventStream;
  reducer?: InteractionReducer;
  reporter?: PipelineReporter;
};

export type InteractionEngineInput = {
  message?: Message;
  previousState?: InteractionState;
  interactionId?: string;
  correlationId?: string;
  captureEvents?: boolean;
};

export type InteractionEngineResult = {
  state: InteractionState;
  events?: InteractionEvent[];
};

type EngineDeps = {
  pipeline: unknown;
  config: InteractionEngineConfig;
};

type PausedState = {
  userState?: InteractionState;
};

function createEmptyState(): InteractionState {
  return {
    messages: [],
    diagnostics: [],
    trace: [],
  };
}

function createStateWithEvents(): InteractionState {
  return {
    messages: [],
    diagnostics: [],
    trace: [],
    events: [],
  };
}

function readPreviousState(input: InteractionEngineInput): InteractionState | undefined {
  let state = input.previousState;
  if (!state && input.captureEvents) {
    state = createStateWithEvents();
  }
  return state;
}

function toInteractionInput(input: InteractionEngineInput) {
  return {
    message: input.message,
    state: readPreviousState(input),
    interactionId: input.interactionId,
    correlationId: input.correlationId,
  };
}

function toRunOptions(deps: EngineDeps, input: InteractionEngineInput): InteractionRunOptions {
  return {
    input: toInteractionInput(input),
    adapters: deps.config.adapters,
    eventStream: deps.config.eventStream,
    reducer: deps.config.reducer,
    reporter: deps.config.reporter,
  };
}

function isPausedOutcome(
  value: InteractionRunOutcome,
): value is PipelinePaused<Record<string, unknown>> {
  return (
    !!value &&
    typeof value === "object" &&
    "__paused" in value &&
    (value as { __paused?: unknown }).__paused === true
  );
}

function readPausedState(outcome: PipelinePaused<Record<string, unknown>>): InteractionState {
  const state = outcome.snapshot.state as PausedState;
  return state.userState ?? createEmptyState();
}

function readOutcomeState(outcome: InteractionRunOutcome): InteractionState {
  if (isPausedOutcome(outcome)) {
    return readPausedState(outcome);
  }
  return outcome.artifact;
}

function toEngineResult(state: InteractionState): InteractionEngineResult {
  return { state, events: state.events };
}

function mapOutcomeToEngineResult(outcome: InteractionRunOutcome): InteractionEngineResult {
  return toEngineResult(readOutcomeState(outcome));
}

function runEngine(deps: EngineDeps, input: InteractionEngineInput) {
  const options = toRunOptions(deps, input);
  const outcome = runInteractionPipeline(deps.pipeline, options);
  return maybeMap(mapOutcomeToEngineResult, outcome);
}

function normalizeConfig(config?: InteractionEngineConfig): InteractionEngineConfig {
  return config ?? {};
}

export function createInteractionEngine(config?: InteractionEngineConfig) {
  const pipeline = createInteractionPipelineWithDefaults();
  const deps: EngineDeps = {
    pipeline,
    config: normalizeConfig(config),
  };
  return { run: bindFirst(runEngine, deps) };
}

export type InteractionEngine = ReturnType<typeof createInteractionEngine>;
