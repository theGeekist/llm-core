import type { AdapterBundle, Model } from "#adapters/types";
import type { MaybePromise } from "#shared/maybe";
import type { Outcome, Runtime } from "#workflow/types";
import type { AnyRecipeHandle, RecipeRunOverrides } from "./handle";
import type { RunInputOf, RecipeName } from "#workflow/types";
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

const buildRecipeRunOverrides = (input: {
  adapters?: AdapterBundle | null;
  providers?: Record<string, string> | null;
  runtime?: Runtime | null;
}): RecipeRunOverrides | null => {
  if (!input.adapters && !input.providers && !input.runtime) {
    return null;
  }
  const overrides: RecipeRunOverrides = {};
  if (input.adapters) {
    overrides.adapters = input.adapters;
  }
  if (input.providers) {
    overrides.providers = input.providers;
  }
  if (input.runtime) {
    overrides.runtime = input.runtime;
  }
  return overrides;
};

const toRecipeRunOverrides = (options: RecipeRunnerOptions): RecipeRunOverrides | null =>
  buildRecipeRunOverrides({
    adapters: options.adapters ?? null,
    providers: options.providers ?? null,
    runtime: options.runtime ?? null,
  });

const isHandleOptions = (options: RecipeRunnerOptions): options is RecipeRunnerHandleOptions =>
  "handle" in options;

const resolveRecipeFactory = (recipeId: RecipeId) => recipes[recipeId];

const readHandleFromRecipe = (options: RecipeRunnerRecipeOptions): AnyRecipeHandle => {
  const factory = resolveRecipeFactory(options.recipeId);
  if (!factory) {
    throw new Error(`Unknown recipeId: ${options.recipeId}`);
  }
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
  return buildRecipeRunOverrides({
    providers: options.providers ?? null,
    runtime: options.runtime ?? null,
  });
};

const runRecipeWithOverrides = (
  input: { handle: AnyRecipeHandle; overrides?: RecipeRunOverrides | null },
  runInput: unknown,
  overrides?: RecipeRunOverrides,
) => {
  const merged = mergeRecipeRunOverrides(input.overrides, overrides);
  const payload = runInput as RunInputOf<RecipeName>;
  if (!merged) {
    return input.handle.run(payload);
  }
  return input.handle.run(payload, merged);
};

const createRunnerState = (options: RecipeRunnerOptions) => ({
  handle: readHandleFromOptions(options),
  overrides: readRunnerOverrides(options),
});

export const createRecipeRunner = (options: RecipeRunnerOptions): RecipeRunner => ({
  run: bindFirst(runRecipeWithOverrides, createRunnerState(options)),
});
