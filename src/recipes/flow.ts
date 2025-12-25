import { createHelper, type HelperApplyOptions, type HelperApplyResult } from "@wpkernel/pipeline";
import type { PipelineReporter } from "@wpkernel/pipeline/core";
import type { AdapterBundle } from "../adapters/types";
import { bindFirst, mapMaybe, type MaybePromise } from "../maybe";
import type { PipelineContext, PipelineState, Plugin, RecipeName } from "../workflow/types";
import { Workflow } from "../workflow/builder";

type StepOptions = {
  context: PipelineContext;
  input: unknown;
  state: PipelineState;
  reporter: PipelineReporter;
};

type StepNext = () => MaybePromise<void>;

export type StepApply = (
  options: StepOptions,
  next?: StepNext,
) => MaybePromise<HelperApplyResult<PipelineState> | void>;

type StepSpec = {
  name: string;
  apply: StepApply;
  dependsOn: string[];
  priority: number;
  mode: "extend" | "override";
};

type StepBuilder = {
  dependsOn: (dependencies: string | string[]) => StepBuilder;
  priority: (value: number) => StepBuilder;
  override: () => StepBuilder;
  extend: () => StepBuilder;
  getSpec: () => StepSpec;
};

type StepFactory = (name: string, apply: StepApply) => StepBuilder;

export type RecipePack = {
  name: string;
  steps: StepSpec[];
  defaults?: RecipeDefaults;
};

export type RecipeDefaults = {
  adapters?: AdapterBundle;
  plugins?: Plugin[];
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

const readStepState = (options: StepStateSource) => options.output ?? options.userState ?? {};

const toStepOptions = (
  options: HelperApplyOptions<PipelineContext, unknown, PipelineState, PipelineReporter>,
): StepOptions => ({
  context: options.context,
  input: options.input,
  state: readStepState(options as StepStateSource),
  reporter: options.reporter,
});

const normalizeStepResult = (
  result: HelperApplyResult<PipelineState> | void,
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

const applyStep = (
  spec: StepSpec,
  options: HelperApplyOptions<PipelineContext, unknown, PipelineState, PipelineReporter>,
  next?: StepNext,
) => {
  const stepOptions = toStepOptions(options);
  const state = stepOptions.state;
  return mapMaybe(spec.apply(stepOptions, next), (result) => normalizeStepResult(result, state));
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

const createStepBuilder = (spec: StepSpec): StepBuilder => ({
  dependsOn: (dependencies: string | string[]) =>
    createStepBuilder({ ...spec, dependsOn: toArray(dependencies) }),
  priority: (value: number) => createStepBuilder({ ...spec, priority: value }),
  override: () => createStepBuilder({ ...spec, mode: "override" }),
  extend: () => createStepBuilder({ ...spec, mode: "extend" }),
  getSpec: () => ({ ...spec }),
});

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

const applyDefaults = (
  builder: { use: (plugin: Plugin) => unknown },
  defaults?: RecipeDefaults,
) => {
  if (!defaults) {
    return;
  }
  const defaultsPlugin = createDefaultsPlugin("flow", defaults);
  if (defaultsPlugin) {
    builder.use(defaultsPlugin);
  }
  if (defaults.plugins) {
    for (const plugin of defaults.plugins) {
      builder.use(plugin);
    }
  }
};

const applyPackDefaults = (builder: { use: (plugin: Plugin) => unknown }, pack: RecipePack) => {
  if (!pack.defaults) {
    return;
  }
  const defaultsPlugin = createDefaultsPlugin(pack.name, pack.defaults);
  if (defaultsPlugin) {
    builder.use(defaultsPlugin);
  }
  if (pack.defaults.plugins) {
    for (const plugin of pack.defaults.plugins) {
      builder.use(plugin);
    }
  }
};

type FlowBuilder<N extends RecipeName> = {
  use: (pack: RecipePack) => FlowBuilder<N>;
  defaults: (defaults: RecipeDefaults) => FlowBuilder<N>;
  build: () => ReturnType<ReturnType<typeof Workflow.recipe<N>>["build"]>;
};

const createFlowBuilder = <N extends RecipeName>(recipeName: N): FlowBuilder<N> => {
  let builder = Workflow.recipe<N>(recipeName);
  const use = (pack: RecipePack) => {
    applyPackDefaults(builder, pack);
    builder = builder.use(createStepPlugin(pack));
    return api;
  };
  const defaults = (defaultsConfig: RecipeDefaults) => {
    applyDefaults(builder, defaultsConfig);
    return api;
  };
  const build = () => builder.build();
  const api: FlowBuilder<N> = { use, defaults, build };
  return api;
};

export const Recipe = {
  pack(
    name: string,
    define: (tools: { step: StepFactory }) => Record<string, StepBuilder>,
    options?: { defaults?: RecipeDefaults },
  ) {
    const steps = collectSteps(define({ step: createStep }));
    return { name, steps, defaults: options?.defaults };
  },
  flow<N extends RecipeName>(name: N) {
    return createFlowBuilder<N>(name);
  },
};
