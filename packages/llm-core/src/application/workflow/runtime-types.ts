import type { MaybePromise } from "#shared/maybe";

export type WorkflowRollbackMode = "retain" | "restart";

export type WorkflowTransition<TState, TPause> =
  | {
      readonly status: "continue";
      readonly state: TState;
    }
  | {
      readonly status: "paused";
      readonly state: TState;
      readonly pause: TPause;
      /**
       * `retain` resumes the paused step with the supplied resume input.
       * `restart` first rolls back completed steps and resumes from step zero.
       */
      readonly rollback?: WorkflowRollbackMode;
    };

export interface WorkflowStepContext<TState, TResumeInput> {
  readonly state: TState;
  readonly resumeInput: TResumeInput | undefined;
  readonly attempt: number;
}

export interface WorkflowRollbackContext<TState> {
  readonly state: TState;
  readonly cause: "failed" | "restart";
}

export interface WorkflowRetryPolicy {
  /** Total calls including the initial call. Values below one are treated as one. */
  readonly maxAttempts: number;
  readonly shouldRetry?: (input: WorkflowShouldRetryInput) => boolean;
  readonly delayMs?: number | ((input: WorkflowRetryDelayInput) => number);
}

export interface WorkflowShouldRetryInput {
  readonly error: unknown;
  readonly attempt: number;
}

export interface WorkflowRetryDelayInput {
  readonly error: unknown;
  readonly attempt: number;
}

export interface ExecutableWorkflowStep<TState, TPause, TResumeInput = unknown> {
  readonly key: string;
  /**
   * The general workflow runtime is passive-only. Meaningful effects require
   * the durable `resumeInterventionWorkflow` path.
   */
  readonly effect: "none";
  readonly retry?: WorkflowRetryPolicy;
  execute(
    context: WorkflowStepContext<TState, TResumeInput>,
  ): MaybePromise<WorkflowTransition<TState, TPause>>;
  rollback?(context: WorkflowRollbackContext<TState>): MaybePromise<void>;
}

export interface WorkflowDefinition<TState, TPause, TResumeInput = unknown> {
  readonly workflowId: string;
  readonly version: string;
  readonly steps: readonly ExecutableWorkflowStep<TState, TPause, TResumeInput>[];
}

export interface WorkflowPauseSnapshot<TState, TPause> {
  readonly kind: "workflow-pause-snapshot";
  readonly durability: "ephemeral";
  readonly checkpoint: false;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly nextStepIndex: number;
  readonly state: TState;
  readonly completedStepKeys: readonly string[];
  readonly pause: TPause;
}

export interface WorkflowRollbackFailure {
  readonly stepKey: string;
  readonly error: unknown;
}

export type WorkflowExecutionOutcome<TState, TPause> =
  | {
      readonly status: "completed";
      readonly state: TState;
      readonly completedStepKeys: readonly string[];
    }
  | {
      readonly status: "paused";
      readonly snapshot: WorkflowPauseSnapshot<TState, TPause>;
    }
  | {
      readonly status: "failed";
      readonly stepKey?: string;
      readonly error: unknown;
      readonly rollbackFailures: readonly WorkflowRollbackFailure[];
    };

export interface WorkflowRuntimeOptions {
  readonly sleep?: (delayMs: number) => MaybePromise<void>;
}

export interface WorkflowRegistry<TState, TPause, TResumeInput = unknown> {
  register(input: WorkflowRegistryRegisterInput<TState, TPause, TResumeInput>): void;
  resolve(workflowId: string): WorkflowDefinition<TState, TPause, TResumeInput> | undefined;
  list(): readonly WorkflowDefinition<TState, TPause, TResumeInput>[];
}

export interface WorkflowRegistryRegisterInput<TState, TPause, TResumeInput = unknown> {
  readonly definition: WorkflowDefinition<TState, TPause, TResumeInput>;
  readonly replace?: boolean;
}
