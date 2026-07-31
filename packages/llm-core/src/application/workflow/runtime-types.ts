import type { MaybePromise } from "#shared/maybe";

export type WorkflowRollbackMode = "retain" | "restart";

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

export type WorkflowStepResult<TState, TPause> =
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

export interface WorkflowStep<TState, TPause, TResumeInput = unknown> {
  readonly key: string;
  /**
   * The general workflow runtime is passive-only. Meaningful effects require
   * the durable `resumeInterventionWorkflow` path.
   */
  readonly effect: "none";
  readonly retry?: WorkflowRetryPolicy;
  execute(
    context: WorkflowStepContext<TState, TResumeInput>,
  ): MaybePromise<WorkflowStepResult<TState, TPause>>;
  rollback?(context: WorkflowRollbackContext<TState>): MaybePromise<void>;
}

export interface WorkflowConfig<TState, TPause, TResumeInput = unknown> {
  /**
   * Optional stable identity for persisted pause values. A fresh identity is
   * allocated when omitted.
   */
  readonly workflowId?: string;
  /** Defaults to `1`. */
  readonly version?: string;
  readonly steps: readonly WorkflowStep<TState, TPause, TResumeInput>[];
}

export interface WorkflowPause<TState, TPause> {
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

export type WorkflowResult<TState, TPause> =
  | {
      readonly status: "completed";
      readonly state: TState;
      readonly completedStepKeys: readonly string[];
    }
  | {
      readonly status: "paused";
      readonly snapshot: WorkflowPause<TState, TPause>;
    }
  | {
      readonly status: "failed";
      readonly stepKey?: string;
      readonly error: unknown;
      readonly rollbackFailures: readonly WorkflowRollbackFailure[];
    };

export interface Workflow<TState, TPause, TResumeInput = unknown> {
  readonly workflowId: string;
  readonly version: string;
  readonly steps: readonly WorkflowStep<TState, TPause, TResumeInput>[];
  run(initialState: TState): MaybePromise<WorkflowResult<TState, TPause>>;
  resume(
    pause: WorkflowPause<TState, TPause>,
    input: TResumeInput,
  ): MaybePromise<WorkflowResult<TState, TPause>>;
}

export interface WorkflowRuntimeOptions {
  readonly sleep?: (delayMs: number) => MaybePromise<void>;
}

export interface WorkflowRegistry<TState, TPause, TResumeInput = unknown> {
  register(input: WorkflowRegistryRegisterInput<TState, TPause, TResumeInput>): void;
  resolve(workflowId: string): Workflow<TState, TPause, TResumeInput> | undefined;
  list(): readonly Workflow<TState, TPause, TResumeInput>[];
}

export interface WorkflowRegistryRegisterInput<TState, TPause, TResumeInput = unknown> {
  readonly workflow: Workflow<TState, TPause, TResumeInput>;
  readonly replace?: boolean;
}
