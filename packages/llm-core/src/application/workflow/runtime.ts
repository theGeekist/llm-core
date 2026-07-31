import { maybeChain, maybeReduce, maybeTry, type MaybePromise } from "#shared/maybe";
import type {
  Workflow,
  WorkflowPause,
  WorkflowResult,
  WorkflowRollbackFailure,
  WorkflowRuntimeOptions,
  WorkflowStep,
  WorkflowTransition,
} from "./runtime-types";

const defaultSleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

const retryDelay = (
  step: WorkflowStep<unknown, unknown, unknown>,
  error: unknown,
  attempt: number,
): number => {
  const configured = step.retry?.delayMs;
  const delay = typeof configured === "function" ? configured({ error, attempt }) : configured;
  return Math.max(0, delay ?? 0);
};

const mayRetry = (
  step: WorkflowStep<unknown, unknown, unknown>,
  error: unknown,
  attempt: number,
): boolean => {
  const configuredAttempts = step.retry?.maxAttempts ?? 1;
  const maxAttempts = Number.isFinite(configuredAttempts)
    ? Math.max(1, Math.floor(configuredAttempts))
    : 1;
  return (
    attempt < maxAttempts &&
    (step.retry?.shouldRetry === undefined || step.retry.shouldRetry({ error, attempt }))
  );
};

type InvokeStepInput<TState, TPause, TResumeInput> = {
  readonly step: WorkflowStep<TState, TPause, TResumeInput>;
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
      if (!mayRetry(input.step as WorkflowStep<unknown, unknown, unknown>, error, attempt)) {
        throw error;
      }
      const delayMs = retryDelay(
        input.step as WorkflowStep<unknown, unknown, unknown>,
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
  readonly step: WorkflowStep<TState, TPause, TResumeInput>;
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
}): WorkflowResult<TState, TPause> => ({
  status: "failed",
  ...(input.stepKey ? { stepKey: input.stepKey } : {}),
  error: input.error,
  rollbackFailures: Object.freeze([...input.rollbackFailures]),
});

const completeOutcome = <TState, TPause>(
  state: TState,
  completed: readonly CompletedStep<TState, TPause, unknown>[],
): WorkflowResult<TState, TPause> => ({
  status: "completed",
  state,
  completedStepKeys: Object.freeze(completed.map(({ step }) => step.key)),
});

const nonPassiveStep = <TState, TPause, TResumeInput>(
  workflow: Workflow<TState, TPause, TResumeInput>,
): WorkflowStep<TState, TPause, TResumeInput> | undefined =>
  workflow.steps.find((step) => (step as { readonly effect?: unknown }).effect !== "none");

const passiveOnlyFailure = <TState, TPause>(
  step: WorkflowStep<TState, TPause, unknown>,
): WorkflowResult<TState, TPause> =>
  failedOutcome({
    error: new TypeError(
      `General workflow step "${step.key}" must declare effect "none"; meaningful effects require the durable intervention workflow.`,
    ),
    rollbackFailures: [],
    stepKey: step.key,
  });

type ExecutionCursor<TState, TPause, TResumeInput> = {
  readonly workflow: Workflow<TState, TPause, TResumeInput>;
  readonly state: TState;
  readonly stepIndex: number;
  readonly completed: readonly CompletedStep<TState, TPause, TResumeInput>[];
  readonly resumeInput: TResumeInput | undefined;
};

const executeFrom = <TState, TPause, TResumeInput>(
  cursor: ExecutionCursor<TState, TPause, TResumeInput>,
  options: WorkflowRuntimeOptions,
): MaybePromise<WorkflowResult<TState, TPause>> => {
  const step = cursor.workflow.steps[cursor.stepIndex];
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
                workflow: cursor.workflow,
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
                kind: "workflow-pause-snapshot",
                durability: "ephemeral",
                checkpoint: false,
                workflowId: cursor.workflow.workflowId,
                workflowVersion: cursor.workflow.version,
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
            (rollbackFailures): WorkflowResult<TState, TPause> => {
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
                  kind: "workflow-pause-snapshot",
                  durability: "ephemeral",
                  checkpoint: false,
                  workflowId: cursor.workflow.workflowId,
                  workflowVersion: cursor.workflow.version,
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
  workflow: Workflow<TState, TPause, TResumeInput>,
  snapshot: WorkflowPause<TState, TPause>,
): readonly CompletedStep<TState, TPause, TResumeInput>[] => {
  const expected = workflow.steps.slice(0, snapshot.nextStepIndex).map((step) => step.key);
  if (
    expected.length !== snapshot.completedStepKeys.length ||
    expected.some((key, index) => key !== snapshot.completedStepKeys[index])
  ) {
    throw new TypeError("Workflow pause snapshot does not match the definition.");
  }
  return workflow.steps.slice(0, snapshot.nextStepIndex).map((step) => ({ step }));
};

export const runWorkflow = <TState, TPause, TResumeInput = unknown>(
  workflow: Workflow<TState, TPause, TResumeInput>,
  initialState: TState,
  options: WorkflowRuntimeOptions = {},
): MaybePromise<WorkflowResult<TState, TPause>> => {
  const unsafe = nonPassiveStep(workflow);
  if (unsafe) {
    return passiveOnlyFailure(unsafe as WorkflowStep<TState, TPause, unknown>);
  }
  return executeFrom(
    {
      workflow,
      state: initialState,
      stepIndex: 0,
      completed: [],
      resumeInput: undefined,
    },
    options,
  );
};

export const resumeWorkflow = <TState, TPause, TResumeInput>(
  workflow: Workflow<TState, TPause, TResumeInput>,
  input: {
    readonly snapshot: WorkflowPause<TState, TPause>;
    readonly resumeInput: TResumeInput;
  },
  options: WorkflowRuntimeOptions = {},
): MaybePromise<WorkflowResult<TState, TPause>> => {
  const unsafe = nonPassiveStep(workflow);
  if (unsafe) {
    return passiveOnlyFailure(unsafe as WorkflowStep<TState, TPause, unknown>);
  }
  if (
    input.snapshot.kind !== "workflow-pause-snapshot" ||
    input.snapshot.durability !== "ephemeral" ||
    input.snapshot.checkpoint !== false ||
    input.snapshot.workflowId !== workflow.workflowId ||
    input.snapshot.workflowVersion !== workflow.version
  ) {
    return failedOutcome({
      error: new TypeError(
        "Workflow pause snapshot is not an ephemeral snapshot for this definition.",
      ),
      rollbackFailures: [],
    });
  }
  return maybeTry(
    (error) => failedOutcome({ error, rollbackFailures: [] }),
    () =>
      executeFrom(
        {
          workflow,
          state: input.snapshot.state,
          stepIndex: input.snapshot.nextStepIndex,
          completed: completedFromSnapshot(workflow, input.snapshot),
          resumeInput: input.resumeInput,
        },
        options,
      ),
  );
};
