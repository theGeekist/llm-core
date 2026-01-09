import { bindFirst } from "../shared/fp";
import { maybeMap, type MaybePromise } from "../shared/maybe";
import type { AdapterBundle, EventStream, Message } from "../adapters/types";
import type { HelperMode, PipelinePaused, PipelineReporter } from "@wpkernel/pipeline/core";
import type {
  InteractionEvent,
  InteractionReducer,
  InteractionRunOptions,
  InteractionRunOutcome,
  InteractionState,
} from "./types";
import type { InteractionStepPack, InteractionStepSpec } from "./steps";
import { InteractionCorePack, registerInteractionPack, runInteractionPipeline } from "./steps";
import { createInteractionPipeline } from "./pipeline";
import type { PlanBase, PlanStepBase } from "../shared/types";
import { normalizeDependencies, normalizeStepKey, sortStepSpecs } from "../shared/steps";

export type InteractionHandleDefaults = {
  adapters?: AdapterBundle;
  eventStream?: EventStream;
  reducer?: InteractionReducer;
  reporter?: PipelineReporter;
};

export type InteractionHandleInput = {
  message?: Message;
  state?: InteractionState;
  interactionId?: string;
  correlationId?: string;
};

export type InteractionHandleOverrides = InteractionHandleDefaults & {
  captureEvents?: boolean;
  abortSignal?: AbortSignal;
};

export type InteractionHandleResult = {
  state: InteractionState;
  events?: InteractionEvent[];
};

export type InteractionStepPlan = PlanStepBase & {
  pack: string;
  mode?: HelperMode;
  origin?: string;
};

export type InteractionPlan = PlanBase & {
  steps: InteractionStepPlan[];
};

export type InteractionHandle = {
  configure(config: InteractionHandleDefaults): InteractionHandle;
  defaults(defaults: InteractionHandleDefaults): InteractionHandle;
  use(pack: InteractionStepPack | InteractionHandle): InteractionHandle;
  explain(): InteractionPlan;
  build(): ReturnType<typeof createInteractionPipeline>;
  run(
    input: InteractionHandleInput,
    overrides?: InteractionHandleOverrides,
  ): MaybePromise<InteractionHandleResult>;
};

type InteractionDefinition = {
  packs: InteractionStepPack[];
  defaults: InteractionHandleDefaults;
};

type InteractionHandleState = {
  base: InteractionDefinition;
  extras: InteractionDefinition;
};

const INTERACTION_HANDLE_STATE = Symbol("interactionHandleState");
const INTERACTION_PLAN_NAME = "interaction";

type InteractionHandleStateCarrier = {
  [INTERACTION_HANDLE_STATE]: InteractionHandleState;
};

type PausedState = {
  userState?: InteractionState;
};

function normalizeDefaults(defaults?: InteractionHandleDefaults): InteractionHandleDefaults {
  return defaults ?? {};
}

function normalizeDefinition(definition: InteractionDefinition): InteractionDefinition {
  return {
    packs: definition.packs ?? [],
    defaults: normalizeDefaults(definition.defaults),
  };
}

function mergeAdapters(base?: AdapterBundle, incoming?: AdapterBundle) {
  if (base && incoming) {
    return { ...base, ...incoming };
  }
  return base ?? incoming;
}

function mergeDefaults(
  base: InteractionHandleDefaults,
  incoming: InteractionHandleDefaults,
): InteractionHandleDefaults {
  return {
    adapters: mergeAdapters(base.adapters, incoming.adapters),
    eventStream: incoming.eventStream ?? base.eventStream,
    reducer: incoming.reducer ?? base.reducer,
    reporter: incoming.reporter ?? base.reporter,
  };
}

function createBaseDefinition(config?: InteractionHandleDefaults): InteractionDefinition {
  return {
    packs: [InteractionCorePack],
    defaults: normalizeDefaults(config),
  };
}

function packHasName(name: string, pack: InteractionStepPack) {
  return pack.name === name;
}

function findPackIndex(packs: InteractionStepPack[], name: string) {
  return packs.findIndex(bindFirst(packHasName, name));
}

function appendPack(packs: InteractionStepPack[], pack: InteractionStepPack) {
  packs.push(pack);
  return packs;
}

function replacePack(packs: InteractionStepPack[], index: number, pack: InteractionStepPack) {
  packs[index] = pack;
  return packs;
}

function mergePack(packs: InteractionStepPack[], pack: InteractionStepPack) {
  const index = findPackIndex(packs, pack.name);
  if (index !== -1) {
    return replacePack(packs, index, pack);
  }
  return appendPack(packs, pack);
}

function mergeDefinitions(base: InteractionDefinition, extras: InteractionDefinition) {
  const packs = [...base.packs];
  for (const pack of extras.packs) {
    mergePack(packs, pack);
  }
  return {
    packs,
    defaults: mergeDefaults(base.defaults, extras.defaults),
  };
}

function resolveDefinition(state: InteractionHandleState) {
  return mergeDefinitions(normalizeDefinition(state.base), normalizeDefinition(state.extras));
}

function readHandleState(value: unknown): InteractionHandleState | null {
  if (value && typeof value === "object" && INTERACTION_HANDLE_STATE in value) {
    return (value as InteractionHandleStateCarrier)[INTERACTION_HANDLE_STATE];
  }
  return null;
}

/** @internal */
export function isInteractionPack(value: unknown): value is InteractionStepPack {
  return (
    !!value &&
    typeof value === "object" &&
    "name" in value &&
    "steps" in value &&
    Array.isArray((value as InteractionStepPack).steps)
  );
}

/** @internal */
export function createEmptyState(): InteractionState {
  return {
    messages: [],
    diagnostics: [],
    trace: [],
  };
}

/** @internal */
export function createStateWithEvents(): InteractionState {
  return {
    messages: [],
    diagnostics: [],
    trace: [],
    events: [],
  };
}

/** @internal */
export function readInputState(
  input: InteractionHandleInput,
  overrides?: InteractionHandleOverrides,
) {
  if (input.state) {
    return input.state;
  }
  if (overrides && overrides.captureEvents) {
    return createStateWithEvents();
  }
  return input.state;
}

/** @internal */
export function toInteractionInput(
  input: InteractionHandleInput,
  overrides?: InteractionHandleOverrides,
) {
  return {
    message: input.message,
    state: readInputState(input, overrides),
    interactionId: input.interactionId,
    correlationId: input.correlationId,
  };
}

function mergeRunDefaults(
  defaults: InteractionHandleDefaults,
  overrides?: InteractionHandleOverrides,
): InteractionHandleDefaults {
  if (!overrides) {
    return defaults;
  }
  return mergeDefaults(defaults, overrides);
}

/** @internal */
export function toRunOptions(
  defaults: InteractionHandleDefaults,
  input: InteractionHandleInput,
  overrides?: InteractionHandleOverrides,
): InteractionRunOptions {
  const runDefaults = mergeRunDefaults(defaults, overrides);
  return {
    input: toInteractionInput(input, overrides),
    adapters: runDefaults.adapters,
    eventStream: runDefaults.eventStream,
    reducer: runDefaults.reducer,
    reporter: runDefaults.reporter,
  };
}

/** @internal */
export function isPausedOutcome(
  value: InteractionRunOutcome,
): value is PipelinePaused<Record<string, unknown>> {
  return (
    !!value &&
    typeof value === "object" &&
    "__paused" in value &&
    (value as { __paused?: unknown }).__paused === true
  );
}

/** @internal */
export function readPausedState(
  outcome: PipelinePaused<Record<string, unknown>>,
): InteractionState {
  const state = outcome.snapshot.state as PausedState;
  return state.userState ?? createEmptyState();
}

/** @internal */
export function readOutcomeState(outcome: InteractionRunOutcome): InteractionState {
  if (isPausedOutcome(outcome)) {
    return readPausedState(outcome);
  }
  return outcome.artefact;
}

/** @internal */
export function toHandleResult(state: InteractionState): InteractionHandleResult {
  return { state, events: state.events };
}

/** @internal */
export function mapOutcomeToHandleResult(outcome: InteractionRunOutcome) {
  return toHandleResult(readOutcomeState(outcome));
}

function createPipelineFromDefinition(definition: InteractionDefinition) {
  const pipeline = createInteractionPipeline();
  for (const pack of definition.packs) {
    registerInteractionPack(pipeline, pack);
  }
  return pipeline;
}

function createStepPlan(pack: InteractionStepPack, step: InteractionStepSpec): InteractionStepPlan {
  return {
    id: normalizeStepKey(pack.name, step.name),
    pack: pack.name,
    dependsOn: normalizeDependencies(pack.name, step.dependsOn ?? []),
    priority: step.priority,
    mode: step.mode,
    origin: step.origin,
  };
}

function appendPackPlans(steps: InteractionStepPlan[], pack: InteractionStepPack) {
  const sorted = sortStepSpecs(pack.name, pack.steps);
  for (const step of sorted) {
    steps.push(createStepPlan(pack, step));
  }
  return steps;
}

function createInteractionPlan(definition: InteractionDefinition): InteractionPlan {
  const steps: InteractionStepPlan[] = [];
  for (const pack of definition.packs) {
    appendPackPlans(steps, pack);
  }
  return { name: INTERACTION_PLAN_NAME, steps };
}

function configureHandleState(state: InteractionHandleState, config: InteractionHandleDefaults) {
  return createInteractionHandleFromState({
    base: {
      ...state.base,
      defaults: normalizeDefaults(config),
    },
    extras: state.extras,
  });
}

function defaultsHandleState(state: InteractionHandleState, defaults: InteractionHandleDefaults) {
  return createInteractionHandleFromState({
    base: state.base,
    extras: {
      ...state.extras,
      defaults: mergeDefaults(state.extras.defaults, defaults),
    },
  });
}

function useHandleState(
  state: InteractionHandleState,
  pack: InteractionStepPack | InteractionHandle,
) {
  const extras = {
    ...state.extras,
    packs: [...state.extras.packs],
  };
  const otherState = readHandleState(pack);
  if (otherState) {
    const definition = resolveDefinition(otherState);
    extras.defaults = mergeDefaults(extras.defaults, definition.defaults);
    for (const nextPack of definition.packs) {
      mergePack(extras.packs, nextPack);
    }
    return createInteractionHandleFromState({ base: state.base, extras });
  }
  if (isInteractionPack(pack)) {
    mergePack(extras.packs, pack);
    return createInteractionHandleFromState({ base: state.base, extras });
  }
  return createInteractionHandleFromState(state);
}

function planHandleState(state: InteractionHandleState) {
  return createInteractionPlan(resolveDefinition(state));
}

function buildHandleState(state: InteractionHandleState) {
  return createPipelineFromDefinition(resolveDefinition(state));
}

function runHandleState(
  state: InteractionHandleState,
  input: InteractionHandleInput,
  overrides?: InteractionHandleOverrides,
) {
  const definition = resolveDefinition(state);
  const options = toRunOptions(definition.defaults, input, overrides);
  const pipeline = createPipelineFromDefinition(definition);
  return maybeMap(mapOutcomeToHandleResult, runInteractionPipeline(pipeline, options));
}

function createInteractionHandleFromState(
  state: InteractionHandleState,
): InteractionHandle & InteractionHandleStateCarrier {
  return {
    [INTERACTION_HANDLE_STATE]: state,
    configure: bindFirst(configureHandleState, state),
    defaults: bindFirst(defaultsHandleState, state),
    use: bindFirst(useHandleState, state),
    explain: bindFirst(planHandleState, state),
    build: bindFirst(buildHandleState, state),
    run: bindFirst(runHandleState, state),
  };
}

export function createInteractionHandle(config?: InteractionHandleDefaults): InteractionHandle {
  return createInteractionHandleFromState({
    base: createBaseDefinition(config),
    extras: normalizeDefinition({ packs: [], defaults: {} }),
  });
}
