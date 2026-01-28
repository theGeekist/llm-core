import { bindFirst } from "./fp";
import { ensureNamespacedId } from "./namespaces";
import type { StepSpecBase } from "./types";

export const normalizeStepKey = ensureNamespacedId;

export const normalizeDependency = ensureNamespacedId;

export const normalizeDependencies = (packName: string, dependencies: readonly string[]) =>
  dependencies.map(bindFirst(ensureNamespacedId, packName));

export const compareStepSpec = (packName: string, left: StepSpecBase, right: StepSpecBase) => {
  const leftKey = normalizeStepKey(packName, left.name);
  const rightKey = normalizeStepKey(packName, right.name);
  return leftKey.localeCompare(rightKey);
};

export const sortStepSpecs = <T extends StepSpecBase>(packName: string, steps: T[]) =>
  [...steps].sort(bindFirst(compareStepSpec, packName));

type PipelineUse = { use: (helper: unknown) => unknown };

export const usePipelineHelper = (pipeline: unknown, helper: unknown) => {
  (pipeline as PipelineUse).use(helper);
  return true;
};
