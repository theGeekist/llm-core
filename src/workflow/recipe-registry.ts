// References: docs/implementation-plan.md#L25-L27,L66-L70; docs/recipes-and-plugins.md

export type RecipeName = string;

export type RecipeContract = {
  name: RecipeName;
};

const registry = new Map<RecipeName, RecipeContract>();

export const registerRecipe = (contract: RecipeContract) => {
  registry.set(contract.name, contract);
};

export const getRecipe = (name: RecipeName) => registry.get(name);
