import { maybeChain, maybeReduce, maybeTry, type MaybePromise } from "#shared/maybe";
import type {
  ExecutableWorkflowStep,
  WorkflowDefinition,
  WorkflowExecutionOutcome,
  WorkflowPauseSnapshot,
  WorkflowRollbackFailure,
  WorkflowRuntimeOptions,
  WorkflowTransition,
} from "./runtime-types";

const defaultSleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

const retryDelay = (
  step: ExecutableWorkflowStep<unknown, unknown, unknown>,
  error: unknown,
  attempt: number,
): number => {
  const configured = step.retry?.delayMs;
  const delay = typeof configured === "function" ? configured(error, attempt) : configured;
  return Math.max(0, delay ?? 0);
};

const mayRetry = (
  step: ExecutableWorkflowStep<unknown, unknown, unknown>,
  error: unknown,
  attempt: number,
): boolean => {
  const configuredAttempts = step.retry?.maxAttempts ?? 1;
  const maxAttempts = Number.isFinite(configuredAttempts)
    ? Math.max(1, Math.floor(configuredAttempts))
    : 1;
  return (
    attempt < maxAttempts &&
    (step.retry?.shouldRetry === undefined || step.retry.shouldRetry(error, attempt))
  );
};

type InvokeStepInput<TState, TPause, TResumeInput> = {
  readonly step: ExecutableWorkflowStep<TState, TPause, TResumeInput>;
  readonly state: TState;
  readonly resumeInput: TResumeInput | undefined;
  readonly options: WorkflowRuntimeOptions;
};

const invokeStep = <TState, TPause, TResumeInput>(
  input: InvokeStepInput<TState, TPause, TResumeInput>,
  attempt = 1,
): MaybePromise<WorkflowTransition<TState, TPause>> =>
  maybeTry(
    (error) => {
      if (
        !mayRetry(input.step as ExecutableWorkflowStep<unknown, unknown, unknown>, error, attempt)
      ) {
        throw error;
      }
      const delayMs = retryDelay(
        input.step as ExecutableWorkflowStep<unknown, unknown, unknown>,
        error,
        attempt,
      );
      if (delayMs === 0) {
        return invokeStep(input, attempt + 1);
      }
      const sleep = input.options.sleep ?? defaultSleep;
      return maybeChain(() => invokeStep(input, attempt + 1), sleep(delayMs));
    },
    () =>
      input.step.execute({
        state: input.state,
        resumeInput: input.resumeInput,
        attempt,
      }),
  );

type CompletedStep<TState, TPause, TResumeInput> = {
  readonly step: ExecutableWorkflowStep<TState, TPause, TResumeInput>;
};

const runRollbacks = <TState, TPause, TResumeInput>(
  completed: readonly CompletedStep<TState, TPause, TResumeInput>[],
  state: TState,
  cause: "failed" | "restart",
): MaybePromise<WorkflowRollbackFailure[]> =>
  maybeReduce(
    (failures, entry) => {
      if (!entry.step.rollback) {
        return failures;
      }
      return maybeTry(
        (error) => {
          failures.push({ stepKey: entry.step.key, error });
          return failures;
        },
        () => maybeChain(() => failures, entry.step.rollback?.({ state, cause }) ?? undefined),
      );
    },
    [] as WorkflowRollbackFailure[],
    [...completed].reverse(),
  );

const failedOutcome = <TState, TPause>(input: {
  readonly error: unknown;
  readonly rollbackFailures: readonly WorkflowRollbackFailure[];
  readonly stepKey?: string;
}): WorkflowExecutionOutcome<TState, TPause> => ({
  status: "failed",
  ...(input.stepKey ? { stepKey: input.stepKey } : {}),
  error: input.error,
  rollbackFailures: Object.freeze([...input.rollbackFailures]),
});

const completeOutcome = <TState, TPause>(
  state: TState,
  completed: readonly CompletedStep<TState, TPause, unknown>[],
): WorkflowExecutionOutcome<TState, TPause> => ({
  status: "completed",
  state,
  completedStepKeys: Object.freeze(completed.map(({ step }) => step.key)),
});

type ExecutionCursor<TState, TPause, TResumeInput> = {
  readonly definition: WorkflowDefinition<TState, TPause, TResumeInput>;
  readonly state: TState;
  readonly stepIndex: number;
  readonly completed: readonly CompletedStep<TState, TPause, TResumeInput>[];
  readonly resumeInput: TResumeInput | undefined;
};

const executeFrom = <TState, TPause, TResumeInput>(
  cursor: ExecutionCursor<TState, TPause, TResumeInput>,
  options: WorkflowRuntimeOptions,
): MaybePromise<WorkflowExecutionOutcome<TState, TPause>> => {
  const step = cursor.definition.steps[cursor.stepIndex];
  if (!step) {
    return completeOutcome(
      cursor.state,
      cursor.completed as readonly CompletedStep<TState, TPause, unknown>[],
    );
  }
  return maybeTry(
    (error) =>
      maybeChain(
        (rollbackFailures) =>
          failedOutcome<TState, TPause>({
            error,
            rollbackFailures,
            stepKey: step.key,
          }),
        runRollbacks(cursor.completed, cursor.state, "failed"),
      ),
    () =>
      maybeChain(
        (transition) => {
          if (transition.status === "continue") {
            return executeFrom(
              {
                definition: cursor.definition,
                state: transition.state,
                stepIndex: cursor.stepIndex + 1,
                completed: [...cursor.completed, { step }],
                resumeInput: undefined,
              },
              options,
            );
          }
          if ((transition.rollback ?? "retain") === "retain") {
            return {
              status: "paused",
              snapshot: {
                workflowId: cursor.definition.workflowId,
                workflowVersion: cursor.definition.version,
                nextStepIndex: cursor.stepIndex,
                state: transition.state,
                completedStepKeys: Object.freeze(
                  cursor.completed.map(({ step: item }) => item.key),
                ),
                pause: transition.pause,
              },
            };
          }
          return maybeChain(
            (rollbackFailures): WorkflowExecutionOutcome<TState, TPause> => {
              if (rollbackFailures.length > 0) {
                return failedOutcome({
                  error: new Error("Workflow restart rollback failed."),
                  rollbackFailures,
                  stepKey: step.key,
                });
              }
              return {
                status: "paused",
                snapshot: {
                  workflowId: cursor.definition.workflowId,
                  workflowVersion: cursor.definition.version,
                  nextStepIndex: 0,
                  state: transition.state,
                  completedStepKeys: Object.freeze([]),
                  pause: transition.pause,
                },
              };
            },
            runRollbacks(cursor.completed, transition.state, "restart"),
          );
        },
        invokeStep({
          step,
          state: cursor.state,
          resumeInput: cursor.resumeInput,
          options,
        }),
      ),
  );
};

const completedFromSnapshot = <TState, TPause, TResumeInput>(
  definition: WorkflowDefinition<TState, TPause, TResumeInput>,
  snapshot: WorkflowPauseSnapshot<TState, TPause>,
): readonly CompletedStep<TState, TPause, TResumeInput>[] => {
  const expected = definition.steps.slice(0, snapshot.nextStepIndex).map((step) => step.key);
  if (
    expected.length !== snapshot.completedStepKeys.length ||
    expected.some((key, index) => key !== snapshot.completedStepKeys[index])
  ) {
    throw new TypeError("Workflow pause snapshot does not match the definition.");
  }
  return definition.steps.slice(0, snapshot.nextStepIndex).map((step) => ({ step }));
};

export const runWorkflow = <TState, TPause, TResumeInput = unknown>(
  definition: WorkflowDefinition<TState, TPause, TResumeInput>,
  initialState: TState,
  options: WorkflowRuntimeOptions = {},
): MaybePromise<WorkflowExecutionOutcome<TState, TPause>> =>
  executeFrom(
    {
      definition,
      state: initialState,
      stepIndex: 0,
      completed: [],
      resumeInput: undefined,
    },
    options,
  );

export const resumeWorkflow = <TState, TPause, TResumeInput>(
  definition: WorkflowDefinition<TState, TPause, TResumeInput>,
  input: {
    readonly snapshot: WorkflowPauseSnapshot<TState, TPause>;
    readonly resumeInput: TResumeInput;
  },
  options: WorkflowRuntimeOptions = {},
): MaybePromise<WorkflowExecutionOutcome<TState, TPause>> => {
  if (
    input.snapshot.workflowId !== definition.workflowId ||
    input.snapshot.workflowVersion !== definition.version
  ) {
    return failedOutcome({
      error: new TypeError("Workflow pause snapshot belongs to another definition."),
      rollbackFailures: [],
    });
  }
  return maybeTry(
    (error) => failedOutcome({ error, rollbackFailures: [] }),
    () =>
      executeFrom(
        {
          definition,
          state: input.snapshot.state,
          stepIndex: input.snapshot.nextStepIndex,
          completed: completedFromSnapshot(definition, input.snapshot),
          resumeInput: input.resumeInput,
        },
        options,
      ),
  );
};
