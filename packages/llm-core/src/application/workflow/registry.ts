import { resumeWorkflow, runWorkflow } from "./runtime";
import type {
  Workflow,
  WorkflowConfig,
  WorkflowPause,
  WorkflowRegistry,
  WorkflowStep,
} from "./runtime-types";

const assertConfig = <TState, TPause, TResumeInput>(
  config: WorkflowConfig<TState, TPause, TResumeInput>,
): void => {
  if (config.workflowId === "" || config.version === "") {
    throw new TypeError("Workflow identity and version must be non-empty.");
  }
  const keys = config.steps.map((step) => step.key);
  if (keys.some((key) => key.length === 0) || new Set(keys).size !== keys.length) {
    throw new TypeError("Workflow step keys must be non-empty and unique.");
  }
};

const snapshotStep = <TState, TPause, TResumeInput>(
  step: WorkflowStep<TState, TPause, TResumeInput>,
): WorkflowStep<TState, TPause, TResumeInput> =>
  Object.freeze({
    ...step,
    ...(step.retry === undefined ? {} : { retry: Object.freeze({ ...step.retry }) }),
  });

export const defineWorkflow = <TState, TPause, TResumeInput = unknown>(
  config: WorkflowConfig<TState, TPause, TResumeInput>,
): Workflow<TState, TPause, TResumeInput> => {
  assertConfig(config);
  const workflowId = config.workflowId ?? crypto.randomUUID();
  const version = config.version ?? "1";
  const steps = Object.freeze(config.steps.map(snapshotStep));
  const workflow: Workflow<TState, TPause, TResumeInput> = Object.freeze({
    workflowId,
    version,
    steps,
    run: (initialState: TState) => runWorkflow(workflow, initialState),
    resume: (pause: WorkflowPause<TState, TPause>, input: TResumeInput) =>
      resumeWorkflow(workflow, {
        snapshot: pause,
        resumeInput: input,
      }),
  });
  return workflow;
};

export const composeWorkflow = <TState, TPause, TResumeInput = unknown>(input: {
  readonly workflowId?: string;
  readonly version?: string;
  readonly workflows: readonly Workflow<TState, TPause, TResumeInput>[];
  readonly steps?: readonly WorkflowStep<TState, TPause, TResumeInput>[];
}): Workflow<TState, TPause, TResumeInput> =>
  defineWorkflow({
    ...(input.workflowId === undefined ? {} : { workflowId: input.workflowId }),
    ...(input.version === undefined ? {} : { version: input.version }),
    steps: [...input.workflows.flatMap((workflow) => workflow.steps), ...(input.steps ?? [])],
  });

export const createWorkflowRegistry = <TState, TPause, TResumeInput = unknown>(): WorkflowRegistry<
  TState,
  TPause,
  TResumeInput
> => {
  const workflows = new Map<string, Workflow<TState, TPause, TResumeInput>>();
  return {
    register({ workflow, replace }) {
      if (workflows.has(workflow.workflowId) && replace !== true) {
        throw new TypeError(`Workflow "${workflow.workflowId}" is already registered.`);
      }
      workflows.set(workflow.workflowId, workflow);
    },
    resolve(workflowId) {
      return workflows.get(workflowId);
    },
    list() {
      return Object.freeze([...workflows.values()]);
    },
  };
};
