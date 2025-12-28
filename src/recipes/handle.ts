import { bindFirst, type MaybePromise } from "../maybe";
import { getRecipe } from "../workflow/recipe-registry";
import type { AdapterBundle } from "../adapters/types";
import type { DiagnosticEntry } from "../workflow/diagnostics";
import type { ArtefactOf, Outcome, RecipeName, RunInputOf, Runtime } from "../workflow/types";
import {
  createFlowRuntime,
  createRecipePlan,
  mergeDefaults,
  mergePackWithDiagnostics,
  type RecipeDefaults,
  type RecipePack,
  type RecipePlan,
} from "./flow";

type RecipeDefinition = {
  packs: RecipePack[];
  defaults: RecipeDefaults;
  diagnostics: DiagnosticEntry[];
};

type RecipeDefinitionInput = {
  packs: RecipePack[];
  defaults?: RecipeDefaults;
  diagnostics?: DiagnosticEntry[];
};

export type RecipeRunOverrides = {
  adapters?: AdapterBundle;
  providers?: Record<string, string>;
  runtime?: Runtime;
};

export type AnyRecipeHandle = RecipeHandle<RecipeName, unknown>;

export type RecipeHandle<N extends RecipeName, C> = {
  configure(config: C): RecipeHandle<N, C>;
  defaults(defaults: RecipeDefaults): RecipeHandle<N, C>;
  use(recipe: AnyRecipeHandle | RecipePack): RecipeHandle<N, C>;
  plan(): RecipePlan;
  build(): ReturnType<typeof createFlowRuntime<N>>;
  run(input: RunInputOf<N>, overrides?: RecipeRunOverrides): MaybePromise<Outcome<ArtefactOf<N>>>;
};

type RecipeFactory<N extends RecipeName, C> = {
  name: N;
  resolve: (config?: C) => RecipeDefinitionInput;
};

type RecipeState<N extends RecipeName, C> = {
  factory: RecipeFactory<N, C>;
  config?: C;
  extras: RecipeDefinition;
};

const RECIPE_STATE = Symbol("recipeState");

type RecipeStateCarrier<N extends RecipeName, C> = {
  [RECIPE_STATE]: RecipeState<N, C>;
};

const normalizeDefinition = (definition: RecipeDefinitionInput): RecipeDefinition => ({
  packs: definition.packs ?? [],
  defaults: definition.defaults ?? {},
  diagnostics: definition.diagnostics ?? [],
});

const resolveBaseDefinition = <N extends RecipeName, C>(
  factory: RecipeFactory<N, C>,
  config?: C,
): RecipeDefinition => normalizeDefinition(factory.resolve(config));

const mergeDefinitions = (base: RecipeDefinition, extras: RecipeDefinition): RecipeDefinition => {
  const packs = [...base.packs];
  const diagnostics = [...base.diagnostics, ...extras.diagnostics];
  const mergeState = { packs, diagnostics };
  for (const pack of extras.packs) {
    mergePackWithDiagnostics(mergeState, pack);
  }
  return {
    packs,
    defaults: mergeDefaults(base.defaults, extras.defaults),
    diagnostics: mergeState.diagnostics,
  };
};

const resolveDefinition = <N extends RecipeName, C>(state: RecipeState<N, C>): RecipeDefinition =>
  mergeDefinitions(resolveBaseDefinition(state.factory, state.config), state.extras);

const requireRecipeContract = <N extends RecipeName>(name: N) => {
  const contract = getRecipe(name);
  if (!contract) {
    throw new Error(`Unknown recipe: ${name}`);
  }
  return contract;
};

const isRecipePack = (value: unknown): value is RecipePack =>
  !!value &&
  typeof value === "object" &&
  "name" in value &&
  "steps" in value &&
  Array.isArray((value as RecipePack).steps);

const readRecipeState = <N extends RecipeName, C>(
  value: unknown,
): RecipeState<N, C> | undefined => {
  if (value && typeof value === "object" && RECIPE_STATE in value) {
    return (value as RecipeStateCarrier<N, C>)[RECIPE_STATE];
  }
  return undefined;
};

const mergeRuntimeOverrides = (
  runtime: Runtime | undefined,
  providers?: Record<string, string>,
) => {
  if (!providers) {
    return runtime;
  }
  return { ...(runtime ?? {}), providers };
};

const applyRunAdapters = (definition: RecipeDefinition, adapters?: AdapterBundle) => {
  if (!adapters) {
    return definition;
  }
  return {
    ...definition,
    defaults: mergeDefaults(definition.defaults, { adapters }),
  };
};

const configureRecipeHandleState = <N extends RecipeName, C>(
  state: RecipeState<N, C>,
  config: C,
): RecipeHandle<N, C> & RecipeStateCarrier<N, C> =>
  createRecipeHandleFromState({
    factory: state.factory,
    config,
    extras: state.extras,
  });

const defaultsRecipeHandleState = <N extends RecipeName, C>(
  state: RecipeState<N, C>,
  defaultsInput: RecipeDefaults,
): RecipeHandle<N, C> & RecipeStateCarrier<N, C> =>
  createRecipeHandleFromState({
    factory: state.factory,
    config: state.config,
    extras: {
      ...state.extras,
      defaults: mergeDefaults(state.extras.defaults, defaultsInput),
    },
  });

const useRecipeHandleState = <N extends RecipeName, C>(
  state: RecipeState<N, C>,
  recipe: AnyRecipeHandle | RecipePack,
): RecipeHandle<N, C> & RecipeStateCarrier<N, C> => {
  const extras = {
    ...state.extras,
    packs: [...state.extras.packs],
    diagnostics: [...state.extras.diagnostics],
  };
  const mergeState = { packs: extras.packs, diagnostics: extras.diagnostics };
  const otherState = readRecipeState(recipe);
  if (otherState) {
    const otherDefinition = resolveDefinition(otherState);
    extras.defaults = mergeDefaults(extras.defaults, otherDefinition.defaults);
    for (const pack of otherDefinition.packs) {
      mergePackWithDiagnostics(mergeState, pack);
    }
    return createRecipeHandleFromState({ factory: state.factory, config: state.config, extras });
  }
  if (isRecipePack(recipe)) {
    mergePackWithDiagnostics(mergeState, recipe);
    return createRecipeHandleFromState({ factory: state.factory, config: state.config, extras });
  }
  return createRecipeHandleFromState(state);
};

const planRecipeHandle = <N extends RecipeName, C>(state: RecipeState<N, C>): RecipePlan => {
  const definition = resolveDefinition(state);
  return createRecipePlan(state.factory.name, definition.packs);
};

const buildRecipeHandle = <N extends RecipeName, C>(
  state: RecipeState<N, C>,
): ReturnType<typeof createFlowRuntime<N>> => {
  const definition = resolveDefinition(state);
  const contract = requireRecipeContract(state.factory.name);
  return createFlowRuntime({
    contract,
    packs: definition.packs,
    defaults: definition.defaults,
    diagnostics: definition.diagnostics,
  });
};

const runRecipeHandle = <N extends RecipeName, C>(
  state: RecipeState<N, C>,
  input: RunInputOf<N>,
  overrides?: RecipeRunOverrides,
): MaybePromise<Outcome<ArtefactOf<N>>> => {
  const definition = applyRunAdapters(resolveDefinition(state), overrides?.adapters);
  const contract = requireRecipeContract(state.factory.name);
  const runtime = createFlowRuntime({
    contract,
    packs: definition.packs,
    defaults: definition.defaults,
    diagnostics: definition.diagnostics,
  });
  return runtime.run(input, mergeRuntimeOverrides(overrides?.runtime, overrides?.providers));
};

const createRecipeHandleFromState = <N extends RecipeName, C>(
  state: RecipeState<N, C>,
): RecipeHandle<N, C> & RecipeStateCarrier<N, C> => ({
  [RECIPE_STATE]: state,
  configure: bindFirst(configureRecipeHandleState, state),
  defaults: bindFirst(defaultsRecipeHandleState, state),
  use: bindFirst(useRecipeHandleState, state),
  plan: bindFirst(planRecipeHandle, state),
  build: bindFirst(buildRecipeHandle, state),
  run: bindFirst(runRecipeHandle, state),
});

export const createRecipeFactory = <N extends RecipeName, C>(
  name: N,
  resolve: (config?: C) => RecipeDefinitionInput,
): RecipeFactory<N, C> => ({
  name,
  resolve,
});

export const createRecipeHandle = <N extends RecipeName, C>(
  factory: RecipeFactory<N, C>,
  config?: C,
): RecipeHandle<N, C> =>
  createRecipeHandleFromState({
    factory,
    config,
    extras: normalizeDefinition({ packs: [] }),
  });

export const createConfiguredRecipeHandle = <N extends RecipeName, C>(
  factory: RecipeFactory<N, C>,
  config: C | undefined,
): RecipeHandle<N, C> => createRecipeHandle(factory, config);

export const useRecipeHandle = <N extends RecipeName, C>(
  handle: RecipeHandle<N, C>,
  recipe: AnyRecipeHandle | RecipePack,
) => handle.use(recipe);

export const configureRecipeHandle = <N extends RecipeName, C>(
  handle: RecipeHandle<N, C>,
  config: C,
) => handle.configure(config);

export const defaultsRecipeHandle = <N extends RecipeName, C>(
  handle: RecipeHandle<N, C>,
  defaults: RecipeDefaults,
) => handle.defaults(defaults);
