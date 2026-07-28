import type { Runtime } from "#workflow/types";
export { wrapRuntimeWithDefaults } from "#workflow/runtime-wrapper";
import type { RecipeDefaults } from "./flow";

export const buildRuntimeDefaults = (defaults: RecipeDefaults): Runtime | undefined =>
  defaults.retryDefaults ? { retryDefaults: defaults.retryDefaults } : undefined;
