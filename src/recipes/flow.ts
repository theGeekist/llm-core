import { createHelper, type HelperApplyOptions, type HelperApplyResult } from "@wpkernel/pipeline";
import type { PipelineReporter } from "@wpkernel/pipeline/core";
import type { AdapterBundle } from "../adapters/types";
import { bindFirst, maybeMap, type MaybePromise } from "../maybe";
import type { DiagnosticEntry } from "../workflow/diagnostics";
import { createRecipeDiagnostic } from "../workflow/diagnostics";
import { getRecipe } from "../workflow/recipe-registry";
import { createRuntime } from "../workflow/runtime";
import type { PipelineContext, PipelineState, Plugin, RecipeName } from "../workflow/types";
import type { StateValidator } from "./state";
import { wrapRuntimeWithStateValidation } from "./state";
import { attachRollback, createStepRollback } from "./rollback";
import type { StepRollbackInput } from "./rollback";

type StepOptions = {
  context: PipelineContext;
  input: unknown;
  state: PipelineState;
  reporter: PipelineReporter;
};

type StepNext = () => MaybePromise<unknown>;

export type StepApply = (
  options: StepOptions,
  next?: StepNext,
) => MaybePromise<HelperApplyResult<PipelineState> | null>;

type StepSpec = {
  name: string;
  apply: StepApply;
  dependsOn: string[];
  priority: number;
  mode: "extend" | "override";
  label?: string;
  kind?: string;
  summary?: string;
  rollback?: StepRollbackInput;
};

type StepBuilder = {
  dependsOn: (dependencies: string | string[]) => StepBuilder;
  priority: (value: number) => StepBuilder;
  override: () => StepBuilder;
  extend: () => StepBuilder;
  label: (value: string) => StepBuilder;
  kind: (value: string) => StepBuilder;
  summary: (value: string) => StepBuilder;
  rollback: (rollback: StepRollbackInput) => StepBuilder;
  getSpec: () => StepSpec;
};

type StepFactory = (name: string, apply: StepApply) => StepBuilder;

export type RecipePack = {
  name: string;
  steps: StepSpec[];
  minimumCapabilities?: string[];
  defaults?: RecipeDefaults;
};

export type RecipeDefaults = {
  adapters?: AdapterBundle;
  plugins?: Plugin[];
};

export type RecipeStepPlan = {
  id: string;
  label?: string;
  recipe: string;
  kind?: string;
  dependsOn: string[];
  priority?: number;
  mode?: "extend" | "override";
  summary?: string;
};

export type RecipePlan = {
  name: string;
  steps: RecipeStepPlan[];
};

const STEP_KIND = "recipe.steps";

const toArray = (value: string | string[]) => (Array.isArray(value) ? value : [value]);

const normalizeStepKey = (packName: string, stepName: string) =>
  stepName.includes(".") ? stepName : `${packName}.${stepName}`;

const normalizeDependency = (packName: string, dependency: string) =>
  dependency.includes(".") ? dependency : `${packName}.${dependency}`;

const normalizeDependencies = (packName: string, dependencies: string[]) =>
  dependencies.map((dep) => normalizeDependency(packName, dep));

type StepStateSource = HelperApplyOptions<
  PipelineContext,
  unknown,
  PipelineState,
  PipelineReporter
> & { userState?: PipelineState };

const isPipelineState = (value: unknown): value is PipelineState =>
  !!value && typeof value === "object" && !Array.isArray(value);

const readStepState = (options: StepStateSource) => {
  if (isPipelineState(options.output)) {
    return options.output;
  }
  if (isPipelineState(options.userState)) {
    return options.userState;
  }
  return {};
};

const toStepOptions = (
  options: HelperApplyOptions<PipelineContext, unknown, PipelineState, PipelineReporter>,
): StepOptions => ({
  context: options.context,
  input: options.input,
  state: readStepState(options as StepStateSource),
  reporter: options.reporter,
});

const normalizeStepResult = (
  result: HelperApplyResult<PipelineState> | null,
  state: PipelineState,
): HelperApplyResult<PipelineState> => {
  if (result && typeof result === "object") {
    if ("output" in result && result.output !== undefined) {
      return result;
    }
    return { ...result, output: state };
  }
  return { output: state };
};

const applyStepResult = (state: PipelineState, result: HelperApplyResult<PipelineState> | null) =>
  normalizeStepResult(result, state);

const createStepFallback = (state: PipelineState) => ({ output: state });

const resolveStepResult = (
  state: PipelineState,
  result: HelperApplyResult<PipelineState> | null,
) => (result === null ? createStepFallback(state) : applyStepResult(state, result));

const applyStep = (
  spec: StepSpec,
  options: HelperApplyOptions<PipelineContext, unknown, PipelineState, PipelineReporter>,
  next?: StepNext,
) => {
  const stepOptions = toStepOptions(options);
  const state = stepOptions.state;
  const applied = spec.apply(stepOptions, next);
  const withRollback = spec.rollback
    ? maybeMap(bindFirst(attachRollback, spec.rollback), applied)
    : applied;
  return maybeMap(bindFirst(resolveStepResult, state), withRollback);
};

const invokeStep = (
  spec: StepSpec,
  options: HelperApplyOptions<PipelineContext, unknown, PipelineState, PipelineReporter>,
  next?: StepNext,
) => applyStep(spec, options, next);

const createHelperForStep = (packName: string, spec: StepSpec) => {
  const key = normalizeStepKey(packName, spec.name);
  const dependsOn = normalizeDependencies(packName, spec.dependsOn);
  return createHelper<PipelineContext, unknown, PipelineState, PipelineReporter>({
    key,
    kind: STEP_KIND,
    mode: spec.mode,
    priority: spec.priority,
    dependsOn,
    apply: bindFirst(invokeStep, spec),
  });
};

const appendDependencies = (current: string[], next: string[]) => [...current, ...next];

class StepBuilderImpl implements StepBuilder {
  private spec: StepSpec;

  constructor(spec: StepSpec) {
    this.spec = spec;
  }

  dependsOn(dependencies: string | string[]) {
    return new StepBuilderImpl({
      ...this.spec,
      dependsOn: appendDependencies(this.spec.dependsOn, toArray(dependencies)),
    });
  }

  priority(value: number) {
    return new StepBuilderImpl({ ...this.spec, priority: value });
  }

  override() {
    return new StepBuilderImpl({ ...this.spec, mode: "override" });
  }

  extend() {
    return new StepBuilderImpl({ ...this.spec, mode: "extend" });
  }

  label(value: string) {
    return new StepBuilderImpl({ ...this.spec, label: value });
  }

  kind(value: string) {
    return new StepBuilderImpl({ ...this.spec, kind: value });
  }

  summary(value: string) {
    return new StepBuilderImpl({ ...this.spec, summary: value });
  }

  rollback(rollback: StepRollbackInput) {
    return new StepBuilderImpl({ ...this.spec, rollback });
  }

  getSpec() {
    return { ...this.spec };
  }
}

const createStepBuilder = (spec: StepSpec): StepBuilder => new StepBuilderImpl(spec);

const createStep: StepFactory = (name, apply) =>
  createStepBuilder({ name, apply, dependsOn: [], priority: 0, mode: "extend" });

const collectSteps = (map: Record<string, StepBuilder>) =>
  Object.values(map).map((step) => step.getSpec());

// Ordering relies on the pipeline DAG and priority; this sort is only a tie-breaker.
const sortSteps = (packName: string, steps: StepSpec[]) =>
  [...steps].sort((left, right) => {
    const leftKey = normalizeStepKey(packName, left.name);
    const rightKey = normalizeStepKey(packName, right.name);
    return leftKey.localeCompare(rightKey);
  });

const createStepPlan = (recipeName: string, packName: string, step: StepSpec): RecipeStepPlan => ({
  id: normalizeStepKey(packName, step.name),
  label: step.label,
  recipe: recipeName,
  kind: step.kind,
  dependsOn: normalizeDependencies(packName, step.dependsOn),
  priority: step.priority,
  mode: step.mode,
  summary: step.summary,
});

const appendPackPlans = (recipeName: string, pack: RecipePack) =>
  sortSteps(pack.name, pack.steps).map((step) => createStepPlan(recipeName, pack.name, step));

export const createRecipePlan = (recipeName: string, packs: RecipePack[]): RecipePlan => ({
  name: recipeName,
  steps: packs.flatMap((pack) => appendPackPlans(recipeName, pack)),
});

type PipelineUse = { use: (helper: unknown) => unknown };

const useHelper = (pipeline: unknown, helper: unknown) => {
  (pipeline as PipelineUse).use(helper);
};

// Register in a deterministic order when DAG/priority do not resolve a tie.
const registerPackSteps = (pipeline: unknown, pack: RecipePack) => {
  for (const step of sortSteps(pack.name, pack.steps)) {
    useHelper(pipeline, createHelperForStep(pack.name, step));
  }
};

const createStepPlugin = (pack: RecipePack): Plugin => ({
  key: `recipe.pack.${pack.name}`,
  helperKinds: [STEP_KIND],
  register: (pipeline) => registerPackSteps(pipeline, pack),
});

const createDefaultsPlugin = (name: string, defaults: RecipeDefaults): Plugin | undefined => {
  if (!defaults.adapters) {
    return undefined;
  }
  return {
    key: `recipe.defaults.${name}`,
    adapters: defaults.adapters,
  };
};

const appendPlugin = (plugins: Plugin[], plugin: Plugin) => {
  plugins.push(plugin);
};

const mergeAdapters = (base?: AdapterBundle, incoming?: AdapterBundle) => {
  if (base && incoming) {
    return { ...base, ...incoming };
  }
  return base ?? incoming;
};

export const mergeDefaults = (base: RecipeDefaults, incoming: RecipeDefaults): RecipeDefaults => ({
  adapters: mergeAdapters(base.adapters, incoming.adapters),
  plugins:
    base.plugins && incoming.plugins
      ? [...base.plugins, ...incoming.plugins]
      : (base.plugins ?? incoming.plugins),
});

const applyDefaultsToPlugins = (plugins: Plugin[], name: string, defaults?: RecipeDefaults) => {
  if (!defaults) {
    return;
  }
  const defaultsPlugin = createDefaultsPlugin(name, defaults);
  if (defaultsPlugin) {
    appendPlugin(plugins, defaultsPlugin);
  }
  if (defaults.plugins) {
    for (const plugin of defaults.plugins) {
      appendPlugin(plugins, plugin);
    }
  }
};

export type FlowBuilder<N extends RecipeName> = {
  use: (pack: RecipePack) => FlowBuilder<N>;
  defaults: (defaults: RecipeDefaults) => FlowBuilder<N>;
  state: (validator: StateValidator) => FlowBuilder<N>;
  build: () => ReturnType<typeof createRuntime<N>>;
};

type FlowRuntimeInput<N extends RecipeName> = {
  contract: ReturnType<typeof getRecipe<N>>;
  packs: RecipePack[];
  defaults: RecipeDefaults;
  diagnostics: DiagnosticEntry[];
  stateValidator?: StateValidator;
};

const readPackMinimums = (pack: RecipePack) => pack.minimumCapabilities ?? [];

const appendMinimumCapabilities = (minimums: string[], next: string[]) => [...minimums, ...next];

const dedupeMinimumCapabilities = (minimums: string[]) => [...new Set(minimums)];

const collectPackMinimums = (packs: RecipePack[]) =>
  dedupeMinimumCapabilities(
    packs.reduce(
      (acc, pack) => appendMinimumCapabilities(acc, readPackMinimums(pack)),
      [] as string[],
    ),
  );

const resolveMinimumCapabilities = (contractMinimums: string[], packs: RecipePack[]) => {
  const packMinimums = collectPackMinimums(packs);
  return packMinimums.length > 0 ? packMinimums : contractMinimums;
};

export const createFlowRuntime = <N extends RecipeName>(input: FlowRuntimeInput<N>) => {
  const minimumCapabilities = resolveMinimumCapabilities(
    input.contract.minimumCapabilities,
    input.packs,
  );
  const contract = { ...input.contract, minimumCapabilities };
  const plugins: Plugin[] = [...(input.contract.defaultPlugins ?? [])];
  applyDefaultsToPlugins(plugins, "flow", input.defaults);
  for (const pack of input.packs) {
    applyDefaultsToPlugins(plugins, pack.name, pack.defaults);
    appendPlugin(plugins, createStepPlugin(pack));
  }
  return wrapRuntimeWithStateValidation(
    createRuntime<N>({
      contract,
      plugins: [...plugins],
      diagnostics: input.diagnostics,
    }),
    input.stateValidator,
  );
};

export const createDuplicatePackDiagnostic = (name: string): DiagnosticEntry =>
  createRecipeDiagnostic(`Duplicate recipe pack name "${name}" overridden`, {
    code: "recipe.duplicatePack",
    pack: name,
  });

const findPackIndex = (packs: RecipePack[], name: string) =>
  packs.findIndex((pack) => pack.name === name);

const appendPack = (packs: RecipePack[], pack: RecipePack) => {
  packs.push(pack);
};

const replacePack = (packs: RecipePack[], index: number, pack: RecipePack) => {
  packs[index] = pack;
};

type PackMergeState = {
  packs: RecipePack[];
  diagnostics: DiagnosticEntry[];
};

export const mergePackWithDiagnostics = (state: PackMergeState, pack: RecipePack) => {
  const existingIndex = findPackIndex(state.packs, pack.name);
  if (existingIndex !== -1) {
    state.diagnostics.push(createDuplicatePackDiagnostic(pack.name));
    replacePack(state.packs, existingIndex, pack);
    return;
  }
  appendPack(state.packs, pack);
};

type FlowBuilderState<N extends RecipeName> = {
  contract: ReturnType<typeof getRecipe<N>>;
  packs: RecipePack[];
  defaults: RecipeDefaults;
  diagnostics: DiagnosticEntry[];
  stateValidator?: StateValidator;
};

const createFlowBuilderFromState = <N extends RecipeName>(
  state: FlowBuilderState<N>,
): FlowBuilder<N> => ({
  use: bindFirst(flowUsePack, state),
  defaults: bindFirst(flowApplyDefaults, state),
  state: bindFirst(flowApplyStateValidator, state),
  build: bindFirst(flowBuildRuntime, state),
});

const flowUsePack = <N extends RecipeName>(state: FlowBuilderState<N>, pack: RecipePack) => {
  mergePackWithDiagnostics({ packs: state.packs, diagnostics: state.diagnostics }, pack);
  return createFlowBuilderFromState(state);
};

const flowApplyDefaults = <N extends RecipeName>(
  state: FlowBuilderState<N>,
  defaultsConfig: RecipeDefaults,
) => {
  const merged = mergeDefaults(state.defaults, defaultsConfig);
  state.defaults.adapters = merged.adapters;
  state.defaults.plugins = merged.plugins;
  return createFlowBuilderFromState(state);
};

const flowApplyStateValidator = <N extends RecipeName>(
  state: FlowBuilderState<N>,
  validator: StateValidator,
) => {
  state.stateValidator = validator;
  return createFlowBuilderFromState(state);
};

const flowBuildRuntime = <N extends RecipeName>(state: FlowBuilderState<N>) =>
  createFlowRuntime({
    contract: state.contract,
    packs: state.packs,
    defaults: state.defaults,
    diagnostics: state.diagnostics,
    stateValidator: state.stateValidator,
  });

const createFlowBuilder = <N extends RecipeName>(recipeName: N): FlowBuilder<N> => {
  const contract = getRecipe(recipeName);
  if (!contract) {
    throw new Error(`Unknown recipe: ${recipeName}`);
  }
  const state: FlowBuilderState<N> = {
    contract,
    packs: [],
    defaults: {},
    diagnostics: [],
    stateValidator: undefined,
  };
  return createFlowBuilderFromState(state);
};

export const Recipe = {
  rollback: createStepRollback,
  pack(
    name: string,
    define: (tools: { step: StepFactory }) => Record<string, StepBuilder>,
    options?: { defaults?: RecipeDefaults; minimumCapabilities?: string[] },
  ) {
    const steps = collectSteps(define({ step: createStep }));
    return {
      name,
      steps,
      defaults: options?.defaults,
      minimumCapabilities: options?.minimumCapabilities,
    };
  },
  flow<N extends RecipeName>(name: N) {
    return createFlowBuilder<N>(name);
  },
};
