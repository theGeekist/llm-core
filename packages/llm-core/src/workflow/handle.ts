import { bindFirst } from "#shared/fp";
import { type MaybePromise } from "#shared/maybe";
import { getRecipe } from "./recipe-registry";
import { buildCapabilities } from "./capabilities";
import { buildExplainSnapshot, type ExplainSnapshot } from "./explain";
import { createRuntime } from "./runtime";
import { mergeRetryConfig } from "./runtime/retry";
import type { DiagnosticEntry } from "#shared/reporting";
import type {
  ArtefactOf,
  Outcome,
  Plugin,
  RecipeContract,
  RecipeName,
  RunInputOf,
  Runtime,
  RuntimeDeps,
  WorkflowRuntime,
} from "./types";

export type WorkflowHandleConfig = {
  diagnostics?: DiagnosticEntry[];
  pipelineFactory?: RuntimeDeps<RecipeName>["pipelineFactory"];
};

export type WorkflowHandle<N extends RecipeName> = {
  configure(config: WorkflowHandleConfig): WorkflowHandle<N>;
  defaults(defaults: Runtime): WorkflowHandle<N>;
  use(plugin: Plugin): WorkflowHandle<N>;
  explain(): ExplainSnapshot;
  build(): WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>;
  run(input: RunInputOf<N>, runtime?: Runtime): MaybePromise<Outcome<ArtefactOf<N>>>;
};

type ResumeInputOf<N extends RecipeName> = import("./types").ResumeInputOf<N>;

type WorkflowHandleState<N extends RecipeName> = {
  contract: RecipeContract & { name: N };
  plugins: Plugin[];
  defaults?: Runtime;
  config: WorkflowHandleConfig;
};

type RuntimeWithResume<N extends RecipeName> = WorkflowRuntime<
  RunInputOf<N>,
  ArtefactOf<N>,
  ResumeInputOf<N>
> & {
  resume: NonNullable<WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>["resume"]>;
};

type RuntimeDefaultsInput<N extends RecipeName> = {
  runtime: WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>;
  defaults?: Runtime;
};

type RuntimeDefaultsResumeInput<N extends RecipeName> = {
  runtime: RuntimeWithResume<N>;
  defaults?: Runtime;
};

type ResumeWithDefaultsPayload<N extends RecipeName> = {
  token: unknown;
  resumeInput?: ResumeInputOf<N>;
  runtime?: Runtime;
};

const emptyConfig: WorkflowHandleConfig = {};

const normalizeConfig = (config?: WorkflowHandleConfig): WorkflowHandleConfig =>
  config ?? emptyConfig;

const mergeRuntimeDefaults = (defaults?: Runtime, runtime?: Runtime) => {
  if (!defaults) {
    return runtime;
  }
  if (!runtime) {
    return defaults;
  }
  return {
    ...defaults,
    ...runtime,
    retryDefaults: mergeRetryConfig(defaults.retryDefaults, runtime.retryDefaults) ?? undefined,
    retry: mergeRetryConfig(defaults.retry, runtime.retry) ?? undefined,
  };
};

const runWithRuntimeDefaults = <N extends RecipeName>(
  input: RuntimeDefaultsInput<N>,
  runInput: RunInputOf<N>,
  runtime?: Runtime,
) => input.runtime.run(runInput, mergeRuntimeDefaults(input.defaults, runtime));

const resumeWithRuntimeDefaults = <N extends RecipeName>(
  input: RuntimeDefaultsResumeInput<N>,
  payload: ResumeWithDefaultsPayload<N>,
) =>
  input.runtime.resume(
    payload.token,
    payload.resumeInput,
    mergeRuntimeDefaults(input.defaults, payload.runtime),
  );

const resumeWithRuntimeDefaultsArgs = <N extends RecipeName>(
  input: RuntimeDefaultsResumeInput<N>,
  ...args: [token: unknown, resumeInput?: ResumeInputOf<N>, runtime?: Runtime]
) =>
  resumeWithRuntimeDefaults(input, {
    token: args[0],
    resumeInput: args[1],
    runtime: args[2],
  });

const wrapRuntimeWithDefaults = <N extends RecipeName>(
  runtime: WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>,
  defaults?: Runtime,
) => {
  if (!defaults) {
    return runtime;
  }
  const input: RuntimeDefaultsInput<N> = { runtime, defaults };
  const resumeInput = runtime.resume
    ? ({
        runtime: runtime as RuntimeWithResume<N>,
        defaults,
      } satisfies RuntimeDefaultsResumeInput<N>)
    : undefined;
  return {
    ...runtime,
    run: bindFirst(runWithRuntimeDefaults<N>, input),
    resume: resumeInput ? bindFirst(resumeWithRuntimeDefaultsArgs<N>, resumeInput) : undefined,
  };
};

const readRecipeContract = <N extends RecipeName>(name: N) => {
  const contract = getRecipe(name);
  if (!contract) {
    throw new Error(`Unknown recipe: ${name}`);
  }
  return contract;
};

const createBaseState = <N extends RecipeName>(name: N): WorkflowHandleState<N> => {
  const contract = readRecipeContract(name);
  const plugins = [...(contract.defaultPlugins ?? [])];
  return {
    contract,
    plugins,
    defaults: undefined,
    config: emptyConfig,
  };
};

const createExplainSnapshot = <N extends RecipeName>(state: WorkflowHandleState<N>) => {
  const snapshot = buildCapabilities(state.plugins);
  return buildExplainSnapshot({
    plugins: state.plugins,
    declaredCapabilities: snapshot.declared,
    resolvedCapabilities: snapshot.resolved,
  });
};

const createWorkflowRuntime = <N extends RecipeName>(state: WorkflowHandleState<N>) =>
  createRuntime<N>({
    contract: state.contract,
    plugins: [...state.plugins],
    diagnostics: state.config.diagnostics,
    pipelineFactory: state.config.pipelineFactory as RuntimeDeps<N>["pipelineFactory"],
  });

const configureWorkflowHandleState = <N extends RecipeName>(
  state: WorkflowHandleState<N>,
  config: WorkflowHandleConfig,
) =>
  createWorkflowHandleFromState({
    contract: state.contract,
    plugins: state.plugins,
    defaults: state.defaults,
    config: normalizeConfig(config),
  });

const defaultsWorkflowHandleState = <N extends RecipeName>(
  state: WorkflowHandleState<N>,
  defaults: Runtime,
) =>
  createWorkflowHandleFromState({
    contract: state.contract,
    plugins: state.plugins,
    defaults: mergeRuntimeDefaults(state.defaults, defaults),
    config: state.config,
  });

const useWorkflowHandleState = <N extends RecipeName>(
  state: WorkflowHandleState<N>,
  plugin: Plugin,
) =>
  createWorkflowHandleFromState({
    contract: state.contract,
    plugins: [...state.plugins, plugin],
    defaults: state.defaults,
    config: state.config,
  });

const explainWorkflowHandleState = <N extends RecipeName>(state: WorkflowHandleState<N>) =>
  createExplainSnapshot(state);

const buildWorkflowHandleState = <N extends RecipeName>(state: WorkflowHandleState<N>) =>
  wrapRuntimeWithDefaults(createWorkflowRuntime(state), state.defaults);

const runWorkflowHandleState = <N extends RecipeName>(
  state: WorkflowHandleState<N>,
  input: RunInputOf<N>,
  runtime?: Runtime,
) => {
  const runtimeHandle = buildWorkflowHandleState(state);
  return runtimeHandle.run(input, runtime);
};

const createWorkflowHandleFromState = <N extends RecipeName>(
  state: WorkflowHandleState<N>,
): WorkflowHandle<N> => ({
  configure: bindFirst(configureWorkflowHandleState, state),
  defaults: bindFirst(defaultsWorkflowHandleState, state),
  use: bindFirst(useWorkflowHandleState, state),
  explain: bindFirst(explainWorkflowHandleState, state),
  build: bindFirst(buildWorkflowHandleState, state),
  run: bindFirst(runWorkflowHandleState, state),
});

export const createWorkflowHandle = <N extends RecipeName>(name: N): WorkflowHandle<N> =>
  createWorkflowHandleFromState(createBaseState(name));
