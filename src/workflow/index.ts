// References: docs/implementation-plan.md#L22-L64

import { createBuilder } from "./builder.ts";
import type { RecipeName } from "./types";

export const Workflow = {
  recipe: <N extends RecipeName>(name: N) => createBuilder(name),
};

export { createBuilder } from "./builder.ts";
export { createRuntime } from "./runtime.ts";
export { registerRecipe, getRecipe } from "./recipe-registry.ts";
export { createContractView } from "./contract.ts";
export { buildExplainSnapshot } from "./explain.ts";
export { Outcome } from "./outcome.ts";
export type { Plugin, RecipeName, RecipeContract, Outcome as OutcomeType } from "./types";
