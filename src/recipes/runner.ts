import type { AdapterBundle, Model } from "#adapters/types";
import type { MaybePromise } from "#shared/maybe";
import type { Outcome, Runtime } from "#workflow/types";
import type { AnyRecipeHandle, RecipeRunOverrides } from "./handle";
import { bindFirst } from "#shared/fp";
import { recipes } from "./catalog";

export type RecipeRunnerHandleOptions = {
  handle: AnyRecipeHandle;
  adapters?: AdapterBundle;
  providers?: Record<string, string>;
  runtime?: Runtime;
};

export type RecipeRunnerRecipeOptions = {
  recipeId: RecipeId;
  model: Model;
  adapters?: AdapterBundle;
  providers?: Record<string, string>;
  runtime?: Runtime;
};

export type RecipeRunnerOptions = RecipeRunnerHandleOptions | RecipeRunnerRecipeOptions;

export type RecipeRunner = {
  run: (input: unknown, overrides?: RecipeRunOverrides) => MaybePromise<Outcome<unknown>>;
};

type MergeableRecord = Record<string, unknown>;
type RecipeId = keyof typeof recipes;

const mergeRecords = <T extends MergeableRecord>(base?: T, next?: T): T | null => {
  if (base && next) {
    return { ...base, ...next };
  }
  return base ?? next ?? null;
};

const mergeRecipeRunOverrides = (
  base?: RecipeRunOverrides | null,
  next?: RecipeRunOverrides | null,
): RecipeRunOverrides | null => {
  const adapters = mergeRecords(
    base?.adapters as MergeableRecord,
    next?.adapters as MergeableRecord,
  ) as AdapterBundle | null;
  const providers = mergeRecords(base?.providers, next?.providers) as Record<string, string> | null;
  const runtime = mergeRecords(
    base?.runtime as MergeableRecord,
    next?.runtime as MergeableRecord,
  ) as Runtime | null;

  if (!adapters && !providers && !runtime) {
    return null;
  }

  const overrides: RecipeRunOverrides = {};
  if (adapters) {
    overrides.adapters = adapters;
  }
  if (providers) {
    overrides.providers = providers;
  }
  if (runtime) {
    overrides.runtime = runtime;
  }
  return overrides;
};

const toRecipeRunOverrides = (options: RecipeRunnerOptions): RecipeRunOverrides | null => {
  if (!options.adapters && !options.providers && !options.runtime) {
    return null;
  }
  const overrides: RecipeRunOverrides = {};
  if (options.adapters) {
    overrides.adapters = options.adapters;
  }
  if (options.providers) {
    overrides.providers = options.providers;
  }
  if (options.runtime) {
    overrides.runtime = options.runtime;
  }
  return overrides;
};

const isHandleOptions = (options: RecipeRunnerOptions): options is RecipeRunnerHandleOptions =>
  "handle" in options;

const resolveRecipeFactory = (recipeId: RecipeId) => recipes[recipeId];

const readHandleFromRecipe = (options: RecipeRunnerRecipeOptions): AnyRecipeHandle => {
  const factory = resolveRecipeFactory(options.recipeId);
  const baseAdapters: AdapterBundle = { model: options.model };
  const merged = mergeRecords(baseAdapters as MergeableRecord, options.adapters as MergeableRecord);
  const adapters = (merged ?? baseAdapters) as AdapterBundle;
  return factory().defaults({ adapters });
};

const readHandleFromOptions = (options: RecipeRunnerOptions): AnyRecipeHandle => {
  if (isHandleOptions(options)) {
    return options.handle;
  }
  return readHandleFromRecipe(options);
};

const readRunnerOverrides = (options: RecipeRunnerOptions): RecipeRunOverrides | null => {
  if (isHandleOptions(options)) {
    return toRecipeRunOverrides(options);
  }
  if (!options.providers && !options.runtime) {
    return null;
  }
  const overrides: RecipeRunOverrides = {};
  if (options.providers) {
    overrides.providers = options.providers;
  }
  if (options.runtime) {
    overrides.runtime = options.runtime;
  }
  return overrides;
};

const runRecipeWithOverrides = (
  input: { handle: AnyRecipeHandle; overrides?: RecipeRunOverrides | null },
  runInput: unknown,
  overrides?: RecipeRunOverrides,
) => {
  const merged = mergeRecipeRunOverrides(input.overrides, overrides);
  if (!merged) {
    return input.handle.run(runInput as never);
  }
  return input.handle.run(runInput as never, merged);
};

const createRunnerState = (options: RecipeRunnerOptions) => ({
  handle: readHandleFromOptions(options),
  overrides: readRunnerOverrides(options),
});

export const createRecipeRunner = (options: RecipeRunnerOptions): RecipeRunner => ({
  run: bindFirst(runRecipeWithOverrides, createRunnerState(options)),
});
