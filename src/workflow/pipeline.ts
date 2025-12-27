import {
  makePipeline,
  type PipelineDiagnostic,
  type PipelineReporter,
  type PipelineStep,
  type PipelineRunState,
} from "@wpkernel/pipeline/core";
import type { PipelineContext, PipelineState, Plugin, RecipeContract, RunOptions } from "./types";
import { getEffectivePlugins } from "./plugins/effective";
import { createDefaultReporter } from "./extensions";
import { bindFirst } from "../maybe";
import type { RollbackEntry, RollbackState } from "./runtime/rollback-types";

type RunResult = PipelineRunState<PipelineState, PipelineDiagnostic> & {
  context: PipelineContext;
  state: Record<string, unknown>;
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

const recordHelperRollbacks = (
  kind: string,
  state: RollbackState,
  _visited: Set<string>,
  rollbacks: RollbackEntry[],
) => {
  const map = state.helperRollbacks ?? new Map<string, RollbackEntry[]>();
  map.set(kind, rollbacks);
  state.helperRollbacks = map;
  return state;
};

const makeHelperStage = (
  kind: string,
  deps: { makeHelperStage: (kind: string, spec: unknown) => unknown },
) =>
  deps.makeHelperStage(kind, {
    onVisited: bindFirst(recordHelperRollbacks, kind),
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

const createRunResult = (options: {
  artifact: PipelineState;
  diagnostics: readonly PipelineDiagnostic[];
  steps: readonly PipelineStep[];
  context: PipelineContext;
  state: Record<string, unknown>;
}): RunResult => ({
  artifact: options.artifact,
  diagnostics: options.diagnostics,
  steps: options.steps,
  context: options.context,
  state: options.state,
});

export const createPipeline = (contract: RecipeContract, plugins: Plugin[]) =>
  makePipeline<
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
