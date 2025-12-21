// References: docs/implementation-plan.md#L22-L64

import { createBuilder } from "./builder";
import type { RecipeName } from "./types";

export const Workflow = {
  recipe: <N extends RecipeName>(name: N) => createBuilder(name),
};

export { createBuilder } from "./builder";
export { createRuntime } from "./runtime";
export { registerRecipe, getRecipe } from "./recipe-registry";
export { createContractView } from "./contract";
export { buildExplainSnapshot } from "./explain";
export { adaptPlugins } from "./plugins/adapter";
export type { Plugin, Outcome, RecipeName, RecipeContract } from "./types";
