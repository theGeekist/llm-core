import type { ExecutableWorkflowStep, WorkflowDefinition, WorkflowRegistry } from "./runtime-types";

const assertDefinition = <TState, TPause, TResumeInput>(
  definition: WorkflowDefinition<TState, TPause, TResumeInput>,
): void => {
  if (definition.workflowId.length === 0 || definition.version.length === 0) {
    throw new TypeError("Workflow identity and version must be non-empty.");
  }
  const keys = definition.steps.map((step) => step.key);
  if (keys.some((key) => key.length === 0) || new Set(keys).size !== keys.length) {
    throw new TypeError("Workflow step keys must be non-empty and unique.");
  }
};

export const defineWorkflow = <TState, TPause, TResumeInput = unknown>(
  definition: WorkflowDefinition<TState, TPause, TResumeInput>,
): WorkflowDefinition<TState, TPause, TResumeInput> => {
  assertDefinition(definition);
  return Object.freeze({
    ...definition,
    steps: Object.freeze([...definition.steps]),
  });
};

export const composeWorkflow = <TState, TPause, TResumeInput = unknown>(input: {
  readonly workflowId: string;
  readonly version: string;
  readonly definitions: readonly WorkflowDefinition<TState, TPause, TResumeInput>[];
  readonly steps?: readonly ExecutableWorkflowStep<TState, TPause, TResumeInput>[];
}): WorkflowDefinition<TState, TPause, TResumeInput> =>
  defineWorkflow({
    workflowId: input.workflowId,
    version: input.version,
    steps: [...input.definitions.flatMap((definition) => definition.steps), ...(input.steps ?? [])],
  });

export const createWorkflowRegistry = <TState, TPause, TResumeInput = unknown>(): WorkflowRegistry<
  TState,
  TPause,
  TResumeInput
> => {
  const definitions = new Map<string, WorkflowDefinition<TState, TPause, TResumeInput>>();
  return {
    register(definition, options) {
      const accepted =
        Object.isFrozen(definition) && Object.isFrozen(definition.steps)
          ? definition
          : defineWorkflow(definition);
      if (definitions.has(accepted.workflowId) && options?.replace !== true) {
        throw new TypeError(`Workflow "${accepted.workflowId}" is already registered.`);
      }
      definitions.set(accepted.workflowId, accepted);
    },
    resolve(workflowId) {
      return definitions.get(workflowId);
    },
    list() {
      return Object.freeze([...definitions.values()]);
    },
  };
};
