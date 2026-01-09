import { makeResumablePipeline } from "@wpkernel/pipeline";
import type {
  HelperApplyResult,
  HelperApplyOptions,
  HelperMode,
  MaybePromise,
  PipelineDiagnostic,
  PipelinePauseOptions,
  PipelinePaused,
  PipelineReporter,
  PipelineStep,
} from "@wpkernel/pipeline/core";
import { createHelper } from "@wpkernel/pipeline/core";
import { bindFirst } from "../shared/fp";
import { hasKeys } from "../shared/guards";
import { readPipelineArtefact } from "../shared/outcome";
import type {
  InteractionContext,
  InteractionInput,
  InteractionPauseRequest,
  InteractionRunOptions,
  InteractionState,
} from "./types";
import { reduceInteractionEvent } from "./reducer";
import type { InteractionReducer, InteractionRunResult } from "./types";
import { INTERACTION_STEP_KIND } from "./constants";

type InteractionHelperState = {
  context: InteractionContext;
  runOptions: InteractionRunOptions;
  userState: InteractionState;
};

type InteractionPipelineState = {
  userState: InteractionState;
};

type InteractionRunnerEnv = {
  pause?: (
    state: InteractionPipelineState,
    options?: PipelinePauseOptions,
  ) => PipelinePaused<InteractionPipelineState>;
};

type InteractionStageDeps = {
  runnerEnv: InteractionRunnerEnv;
  makeHelperStage: (kind: string, spec: { makeArgs: typeof createHelperArgs }) => unknown;
  finalizeResult: unknown;
};

/** @internal */
export const createDefaultReporter = (): PipelineReporter => ({});

/** @internal */
export const createInteractionState = (input?: InteractionInput): InteractionState => ({
  messages: [],
  diagnostics: [],
  trace: [],
  events: undefined,
  lastSequence: undefined,
  private: undefined,
  ...input?.state,
});

/** @internal */
export const createContext = (options: InteractionRunOptions): InteractionContext => ({
  reporter: options.reporter ?? createDefaultReporter(),
  adapters: options.adapters,
  reducer: options.reducer ?? reduceInteractionEvent,
  eventStream: options.eventStream,
});

/** @internal */
export const createState = (options: {
  context: InteractionContext;
  options: InteractionRunOptions;
}) => createInteractionState(options.options.input);

/** @internal */
export const buildHelperArgs = (
  state: InteractionHelperState,
  _helper: unknown,
): HelperApplyOptions<InteractionContext, InteractionInput, InteractionState, PipelineReporter> => {
  void _helper;
  return {
    context: state.context,
    input: state.runOptions.input,
    output: state.userState,
    reporter: state.context.reporter,
  };
};

/** @internal */
export const createHelperArgs = (state: InteractionHelperState) =>
  bindFirst(buildHelperArgs, state);

/** @internal */
export function readPauseRequest(state: InteractionState): InteractionPauseRequest | null {
  return state.private?.pause ?? null;
}

/** @internal */
export function clearPauseRequest(state: InteractionState) {
  const privateState = state.private;
  if (!privateState || !privateState.pause) {
    return state;
  }
  const nextPrivate = { ...privateState };
  delete nextPrivate.pause;
  return {
    ...state,
    private: hasKeys(nextPrivate) ? nextPrivate : undefined,
  };
}

/** @internal */
export function replaceUserState(state: InteractionPipelineState, userState: InteractionState) {
  return { ...state, userState };
}

/** @internal */
export function toPauseOptions(pause: InteractionPauseRequest): PipelinePauseOptions {
  return {
    token: pause.token,
    pauseKind: pause.pauseKind,
    payload: pause.payload,
  };
}

/** @internal */
export function applyPauseStage(deps: InteractionStageDeps, state: InteractionPipelineState) {
  const pause = readPauseRequest(state.userState);
  if (!pause) {
    return state;
  }
  if (!deps.runnerEnv.pause) {
    return state;
  }
  const nextState = replaceUserState(state, clearPauseRequest(state.userState));
  return deps.runnerEnv.pause(nextState, toPauseOptions(pause));
}

function createPauseStage(deps: InteractionStageDeps) {
  return bindFirst(applyPauseStage, deps);
}

const createStages = (deps: unknown) => {
  const stageDeps = deps as InteractionStageDeps;
  const stages: unknown[] = [];
  stages.push(
    stageDeps.makeHelperStage(INTERACTION_STEP_KIND, {
      makeArgs: createHelperArgs,
    }),
  );
  stages.push(createPauseStage(stageDeps));
  stages.push(stageDeps.finalizeResult);
  return stages;
};

/** @internal */
export const createRunResult = (
  options: { artefact: InteractionState } & {
    diagnostics: readonly PipelineDiagnostic[];
    steps: readonly PipelineStep[];
    context: InteractionContext;
    state: Record<string, unknown>;
  },
): InteractionRunResult => ({
  artefact: readPipelineArtefact({ artefact: options.artefact }),
  diagnostics: options.diagnostics,
  steps: options.steps,
  context: options.context,
  state: options.state,
});

export const createInteractionPipeline = () =>
  makeResumablePipeline<
    InteractionRunOptions,
    InteractionContext,
    PipelineReporter,
    InteractionState,
    PipelineDiagnostic,
    InteractionRunResult
  >({
    helperKinds: [INTERACTION_STEP_KIND],
    createContext,
    createState,
    createStages,
    createRunResult: (opts) =>
      createRunResult({
        ...opts,
        artefact: opts.artifact,
      }),
  });

export type InteractionStepApply = (
  options: HelperApplyOptions<
    InteractionContext,
    InteractionInput,
    InteractionState,
    PipelineReporter
  >,
  next?: () => MaybePromise<void>,
) => MaybePromise<HelperApplyResult<InteractionState> | void>;

export const createInteractionStep = (options: {
  key: string;
  apply: InteractionStepApply;
  dependsOn?: readonly string[];
  mode?: HelperMode;
  priority?: number;
  origin?: string;
}) =>
  createHelper({
    key: options.key,
    kind: INTERACTION_STEP_KIND,
    mode: options.mode,
    priority: options.priority,
    dependsOn: options.dependsOn,
    origin: options.origin,
    apply: options.apply,
  });

export const createInteractionReducer = (reducer?: InteractionReducer) =>
  reducer ?? reduceInteractionEvent;
