import type { HelperApplyResult, PipelineReporter } from "@wpkernel/pipeline/core";
import { bindFirst, toArray, type MaybePromise } from "../maybe";
import type { PipelineContext, PipelineState } from "../workflow/types";
import type { StepRollbackInput } from "./rollback";

export type StepOptions = {
  context: PipelineContext;
  input: unknown;
  state: PipelineState;
  reporter: PipelineReporter;
};

export type StepNext = () => MaybePromise<unknown>;

export type StepApply = (
  options: StepOptions,
  next?: StepNext,
) => MaybePromise<HelperApplyResult<PipelineState> | null>;

export type StepSpec = {
  name: string;
  apply: StepApply;
  dependsOn: string[];
  priority: number;
  mode: "extend" | "override";
  label?: string;
  kind?: string;
  summary?: string;
  rollback?: StepRollbackInput;
};

export type StepBuilder = {
  dependsOn: (dependencies: string | string[]) => StepBuilder;
  priority: (value: number) => StepBuilder;
  override: () => StepBuilder;
  extend: () => StepBuilder;
  label: (value: string) => StepBuilder;
  kind: (value: string) => StepBuilder;
  summary: (value: string) => StepBuilder;
  rollback: (rollback: StepRollbackInput) => StepBuilder;
  getSpec: () => StepSpec;
};

export type StepFactory = (name: string, apply: StepApply) => StepBuilder;

const appendDependencies = (current: string[], next: string[]) => [...current, ...next];

const stepBuilderDependsOn = (spec: StepSpec, dependencies: string | string[]) =>
  createStepBuilder({
    ...spec,
    dependsOn: appendDependencies(spec.dependsOn, toArray(dependencies)),
  });

const stepBuilderPriority = (spec: StepSpec, value: number) =>
  createStepBuilder({ ...spec, priority: value });

const stepBuilderOverride = (spec: StepSpec) => createStepBuilder({ ...spec, mode: "override" });

const stepBuilderExtend = (spec: StepSpec) => createStepBuilder({ ...spec, mode: "extend" });

const stepBuilderLabel = (spec: StepSpec, value: string) =>
  createStepBuilder({ ...spec, label: value });

const stepBuilderKind = (spec: StepSpec, value: string) =>
  createStepBuilder({ ...spec, kind: value });

const stepBuilderSummary = (spec: StepSpec, value: string) =>
  createStepBuilder({ ...spec, summary: value });

const stepBuilderRollback = (spec: StepSpec, rollback: StepRollbackInput) =>
  createStepBuilder({ ...spec, rollback });

const stepBuilderGetSpec = (spec: StepSpec) => ({ ...spec });

const createStepBuilder = (spec: StepSpec): StepBuilder => ({
  dependsOn: bindFirst(stepBuilderDependsOn, spec),
  priority: bindFirst(stepBuilderPriority, spec),
  override: bindFirst(stepBuilderOverride, spec),
  extend: bindFirst(stepBuilderExtend, spec),
  label: bindFirst(stepBuilderLabel, spec),
  kind: bindFirst(stepBuilderKind, spec),
  summary: bindFirst(stepBuilderSummary, spec),
  rollback: bindFirst(stepBuilderRollback, spec),
  getSpec: bindFirst(stepBuilderGetSpec, spec),
});

export const createStep: StepFactory = (name, apply) =>
  createStepBuilder({ name, apply, dependsOn: [], priority: 0, mode: "extend" });

export const collectSteps = (map: Record<string, StepBuilder>) =>
  Object.values(map).map((step) => step.getSpec());
