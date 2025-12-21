// References: docs/implementation-plan.md#L29-L33,L79-L84; docs/workflow-notes.md

import { createRuntime } from "./runtime";
import type { WorkflowRuntime } from "./types";
import type { ArtefactOf, HumanInputOf, Plugin, RecipeName, RunInputOf } from "./types";
import { getRecipe } from "./recipe-registry";

export type WorkflowBuilder<N extends RecipeName> = {
  use: (plugin: Plugin) => WorkflowBuilder<N>;
  build: () => WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, HumanInputOf<N>>;
};

export const createBuilder = <N extends RecipeName>(recipeName: N): WorkflowBuilder<N> => {
  const contract = getRecipe(recipeName);
  if (!contract) {
    throw new Error(`Unknown recipe: ${recipeName}`);
  }

  const plugins: Plugin[] = [];

  const use = (plugin: Plugin) => {
    plugins.push(plugin);
    return builder;
  };

  const build = () => createRuntime<N>({ contract, plugins: [...plugins] });

  const builder: WorkflowBuilder<N> = { use, build };
  return builder;
};
