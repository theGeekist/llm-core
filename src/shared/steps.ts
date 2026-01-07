import { bindFirst } from "./maybe";
import type { StepSpecBase } from "./types";

export const normalizeStepKey = (packName: string, stepName: string) =>
  stepName.includes(".") ? stepName : `${packName}.${stepName}`;

export const normalizeDependency = (packName: string, dependency: string) =>
  dependency.includes(".") ? dependency : `${packName}.${dependency}`;

export const normalizeDependencies = (packName: string, dependencies: readonly string[]) =>
  dependencies.map(bindFirst(normalizeDependency, packName));

export const compareStepSpec = (packName: string, left: StepSpecBase, right: StepSpecBase) => {
  const leftKey = normalizeStepKey(packName, left.name);
  const rightKey = normalizeStepKey(packName, right.name);
  return leftKey.localeCompare(rightKey);
};
