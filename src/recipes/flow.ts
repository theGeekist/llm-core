import { createHelper, type HelperApplyOptions, type HelperApplyResult } from "@wpkernel/pipeline";
import type { PipelineReporter } from "@wpkernel/pipeline/core";
import type { AdapterBundle } from "../adapters/types";
import { bindFirst, mapMaybe, type MaybePromise } from "../maybe";
import type { DiagnosticEntry } from "../workflow/diagnostics";
import { createRecipeDiagnostic } from "../workflow/diagnostics";
import { getRecipe } from "../workflow/recipe-registry";
import { createRuntime } from "../workflow/runtime";
import type { PipelineContext, PipelineState, Plugin, RecipeName } from "../workflow/types";

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

const appendDependencies = (current: string[], next: string[]) => [...current, ...next];

const createStepBuilder = (spec: StepSpec): StepBuilder => ({
  dependsOn: (dependencies: string | string[]) =>
    createStepBuilder({
      ...spec,
      dependsOn: appendDependencies(spec.dependsOn, toArray(dependencies)),
    }),
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

const appendPlugin = (plugins: Plugin[], plugin: Plugin) => {
  plugins.push(plugin);
};

const mergeAdapters = (base?: AdapterBundle, incoming?: AdapterBundle) => {
  if (base && incoming) {
    return { ...base, ...incoming };
  }
  return base ?? incoming;
};

const mergeDefaults = (base: RecipeDefaults, incoming: RecipeDefaults): RecipeDefaults => ({
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

type FlowBuilder<N extends RecipeName> = {
  use: (pack: RecipePack) => FlowBuilder<N>;
  defaults: (defaults: RecipeDefaults) => FlowBuilder<N>;
  build: () => ReturnType<typeof createRuntime<N>>;
};

const createDuplicatePackDiagnostic = (name: string): DiagnosticEntry =>
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

const createFlowBuilder = <N extends RecipeName>(recipeName: N): FlowBuilder<N> => {
  const contract = getRecipe(recipeName);
  if (!contract) {
    throw new Error(`Unknown recipe: ${recipeName}`);
  }
  const packs: RecipePack[] = [];
  const flowDefaults: RecipeDefaults = {};
  const diagnostics: DiagnosticEntry[] = [];

  const use = (pack: RecipePack) => {
    const existingIndex = findPackIndex(packs, pack.name);
    if (existingIndex !== -1) {
      diagnostics.push(createDuplicatePackDiagnostic(pack.name));
      replacePack(packs, existingIndex, pack);
    } else {
      appendPack(packs, pack);
    }
    return api;
  };
  const defaults = (defaultsConfig: RecipeDefaults) => {
    const merged = mergeDefaults(flowDefaults, defaultsConfig);
    flowDefaults.adapters = merged.adapters;
    flowDefaults.plugins = merged.plugins;
    return api;
  };
  const build = () => {
    const plugins: Plugin[] = [...(contract.defaultPlugins ?? [])];
    applyDefaultsToPlugins(plugins, "flow", flowDefaults);
    for (const pack of packs) {
      applyDefaultsToPlugins(plugins, pack.name, pack.defaults);
      appendPlugin(plugins, createStepPlugin(pack));
    }
    return createRuntime<N>({
      contract,
      plugins: [...plugins],
      diagnostics,
    });
  };
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
