import { makeResumablePipeline } from "@wpkernel/pipeline";
import type { PipelineDiagnostic, PipelineReporter, PipelineStep } from "@wpkernel/pipeline/core";
import type { PipelineContext, PipelineState, Plugin, RecipeContract, RunOptions } from "./types";
import { getEffectivePlugins } from "./plugins/effective";
import { createDefaultReporter } from "./extensions";
import { bindFirst } from "#shared/fp";
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

const makeCreateStages = (contract: RecipeContract, plugins: Plugin[]) =>
  function createStages(deps: unknown) {
    const stageDeps = deps as {
      makeLifecycleStage: (name: string) => unknown;
      makeHelperStage: (kind: string, spec: unknown) => unknown;
      finalizeResult: unknown;
    };
    const lifecycles = contract.extensionPoints.map((name) => stageDeps.makeLifecycleStage(name));
    const helperStages = collectHelperKinds(contract, plugins).map((kind) =>
      makeHelperStage(kind, stageDeps),
    );
    return [...lifecycles, ...helperStages, stageDeps.finalizeResult];
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
