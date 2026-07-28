import { makeResumablePipeline } from "@wpkernel/pipeline";
import type {
  PipelineDiagnostic,
  PipelinePauseOptions,
  PipelinePaused,
  PipelineReporter,
  PipelineStep,
} from "@wpkernel/pipeline/core";
import type { PipelineContext, PipelineState, Plugin, RecipeContract, RunOptions } from "./types";
import { getEffectivePlugins } from "./plugins/effective";
import { createDefaultReporter } from "./extensions";
import { bindFirst } from "#shared/fp";
import { isRecord } from "#shared/guards";
import type { PauseRequest } from "#shared/types";
import type { RollbackEntry, RollbackState } from "./runtime/rollback-types";
import { readPipelineArtefact } from "#shared/outcome";

type RunResult = {
  readonly artefact: PipelineState;
  readonly diagnostics: readonly PipelineDiagnostic[];
  readonly steps: readonly PipelineStep[];
  readonly context: PipelineContext;
  readonly state: Record<string, unknown>;
};

type HelperStageState = {
  context: PipelineContext;
  runOptions: RunOptions;
  userState: PipelineState;
};

type WorkflowPipelineState = {
  userState: PipelineState;
};

type WorkflowRunnerEnv = {
  pause?: (
    state: WorkflowPipelineState,
    options?: PipelinePauseOptions,
  ) => PipelinePaused<WorkflowPipelineState>;
};

type WorkflowStageDeps = {
  runnerEnv: WorkflowRunnerEnv;
  makeLifecycleStage: (name: string) => unknown;
  makeHelperStage: (kind: string, spec: unknown) => unknown;
  finalizeResult: unknown;
};

const collectHelperKinds = (contract: RecipeContract, plugins: Plugin[]) => {
  const kinds = new Set(contract.helperKinds ?? []);
  const effectivePlugins = getEffectivePlugins(plugins);
  for (const plugin of effectivePlugins) {
    for (const kind of plugin.helperKinds ?? []) {
      kinds.add(kind);
    }
  }
  return Array.from(kinds);
};

function createContext(options: RunOptions): PipelineContext {
  return {
    reporter: options.reporter ?? createDefaultReporter(),
    runtime: options.runtime,
    adapters: options.adapters,
  };
}

function createState(): PipelineState {
  return {};
}

type RecordHelperRollbacksInput = {
  kind: string;
  state: RollbackState;
  rollbacks: RollbackEntry[];
};

const recordHelperRollbacks = (input: RecordHelperRollbacksInput) => {
  const map = input.state.helperRollbacks ?? new Map<string, RollbackEntry[]>();
  map.set(input.kind, input.rollbacks);
  input.state.helperRollbacks = map;
  return input.state;
};

const recordHelperRollbacksArgs = (
  kind: string,
  ...args: [state: RollbackState, _visited: Set<string>, rollbacks: RollbackEntry[]]
) =>
  recordHelperRollbacks({
    kind,
    state: args[0],
    rollbacks: args[2],
  });

const createHelperArgs = (state: HelperStageState) =>
  function buildHelperArgs(_helper: unknown) {
    void _helper;
    return {
      context: state.context,
      input: state.runOptions.input,
      output: state.userState,
      reporter: state.context.reporter,
    };
  };

const makeHelperStage = (
  kind: string,
  deps: { makeHelperStage: (kind: string, spec: unknown) => unknown },
) =>
  deps.makeHelperStage(kind, {
    onVisited: bindFirst(recordHelperRollbacksArgs, kind),
    makeArgs: createHelperArgs,
  });

/** @internal */
export const readPauseRequest = (state: PipelineState): PauseRequest | null =>
  isRecord(state.__pause) ? (state.__pause as PauseRequest) : null;

/** @internal */
export const clearPauseRequest = (state: PipelineState): PipelineState => {
  if (!("__pause" in state)) {
    return state;
  }
  const nextState = { ...state };
  delete nextState.__pause;
  return nextState;
};

const replaceUserState = (state: WorkflowPipelineState, userState: PipelineState) => ({
  ...state,
  userState,
});

const toPauseOptions = (pause: PauseRequest): PipelinePauseOptions => ({
  token: pause.token,
  pauseKind: pause.pauseKind,
  payload: pause.payload,
});

/** @internal */
export const applyPauseStage = (deps: WorkflowStageDeps, state: WorkflowPipelineState) => {
  const pause = readPauseRequest(state.userState);
  if (!pause || !deps.runnerEnv.pause) {
    return state;
  }
  return deps.runnerEnv.pause(
    replaceUserState(state, clearPauseRequest(state.userState)),
    toPauseOptions(pause),
  );
};

const createPauseStage = (deps: WorkflowStageDeps) => bindFirst(applyPauseStage, deps);

const makeCreateStages = (contract: RecipeContract, plugins: Plugin[]) =>
  function createStages(deps: unknown) {
    const stageDeps = deps as WorkflowStageDeps;
    const lifecycles = contract.extensionPoints.map((name) => stageDeps.makeLifecycleStage(name));
    const helperStages = collectHelperKinds(contract, plugins).map((kind) =>
      makeHelperStage(kind, stageDeps),
    );
    return [...lifecycles, ...helperStages, createPauseStage(stageDeps), stageDeps.finalizeResult];
  };

const createRunResult = (
  options: { artifact: PipelineState } & {
    diagnostics: readonly PipelineDiagnostic[];
    steps: readonly PipelineStep[];
    context: PipelineContext;
    state: Record<string, unknown>;
  },
): RunResult => ({
  artefact: readPipelineArtefact({ artefact: options.artifact }),
  diagnostics: options.diagnostics,
  steps: options.steps,
  context: options.context,
  state: options.state,
});

export const createPipeline = (contract: RecipeContract, plugins: Plugin[]) =>
  makeResumablePipeline<
    RunOptions,
    PipelineContext,
    PipelineReporter,
    PipelineState,
    PipelineDiagnostic,
    RunResult
  >({
    helperKinds: collectHelperKinds(contract, plugins),
    createContext,
    createState,
    createStages: makeCreateStages(contract, plugins),
    createRunResult,
  });
