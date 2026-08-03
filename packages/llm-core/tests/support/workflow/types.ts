/** Test-only controlled workflow proof contracts. */
import type { JsonValue, StepId } from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type {
  ActionDigest,
  ActionDigestPort,
  BoundAction,
} from "../../../src/features/tooling/runtime";
import type {
  CheckpointId,
  InterventionAuthenticationPort,
  InterventionDecision,
  InterventionDecisionId,
  InterventionId,
  InterventionRequest,
  RecordedEffect,
  ResumeCompatibility,
  ResumeCompatibilityFailure,
} from "../../../src/features/state/public";
import type { RegisteredResumableCheckpoint } from "../../../src/features/state/runtime";
import type {
  CompiledSpecification,
  SpecificationAuthorityDependencies,
} from "../../../src/application/specification-compiler/types";
import type { WorkflowExecutionPlan } from "../../../src/features/workflow/public";

export interface WorkflowDecisionToken {
  readonly decisionToken: string;
  readonly decisionId: InterventionDecisionId;
  readonly interventionId: InterventionId;
}

export interface WorkflowCheckpointClaim {
  readonly claimToken: string;
  readonly checkpointId: CheckpointId;
  readonly checkpointRevision: number;
}

export type WorkflowResumeBeginResult =
  | {
      readonly status: "accepted";
      readonly decision: WorkflowDecisionToken;
      readonly checkpoint?: WorkflowCheckpointClaim;
    }
  | { readonly status: "decision-already-consumed" }
  | { readonly status: "intervention-already-resolved" }
  | { readonly status: "checkpoint-already-claimed" }
  | { readonly status: "checkpoint-already-consumed" };

export type WorkflowResumeDisposition =
  | "completed"
  | "denied"
  | "deferred"
  | "edit-requires-new-binding"
  | "cancelled"
  | "escalated";

export interface WorkflowCheckpointCommit {
  readonly disposition: "completed" | "denied" | "cancelled";
  readonly state: JsonValue;
  readonly completedStepIds: readonly StepId[];
  readonly recordedEffects: readonly RecordedEffect[];
}

/**
 * Intervention resolution/decision replay and checkpoint execution are
 * separate durable identities. `begin` atomically resolves one intervention,
 * consumes its decision ID, and claims the checkpoint only when
 * `claimCheckpoint` is true.
 */
export interface WorkflowResumeJournal {
  begin(input: {
    checkpointId: CheckpointId;
    checkpointRevision: number;
    interventionId: InterventionId;
    decisionId: InterventionDecisionId;
    claimCheckpoint: boolean;
  }): MaybePromise<WorkflowResumeBeginResult>;
  completeDecision(input: {
    decision: WorkflowDecisionToken;
    outcome: "deferred" | "edit-requires-new-binding" | "escalated";
  }): MaybePromise<boolean>;
  recordEffectStarted(input: {
    claim: WorkflowCheckpointClaim;
    stepId: StepId;
    actionDigest: ActionDigest;
  }): MaybePromise<{ durable: "acknowledged"; effect: RecordedEffect }>;
  recordEffectCompleted(input: {
    claim: WorkflowCheckpointClaim;
    started: RecordedEffect;
    completed: RecordedEffect;
    state: JsonValue;
    completedStepIds: readonly StepId[];
  }): MaybePromise<boolean>;
  completeCheckpoint(input: {
    decision: WorkflowDecisionToken;
    claim: WorkflowCheckpointClaim;
    commit: WorkflowCheckpointCommit;
  }): MaybePromise<boolean>;
  quarantine(input: {
    decision: WorkflowDecisionToken;
    claim?: WorkflowCheckpointClaim;
    reason:
      | "authentication-failed"
      | "effect-state-unsafe"
      | "execution-failed"
      | "persistence-failed"
      | "specification-authority-invalid";
  }): MaybePromise<void>;
}

export interface WorkflowClock {
  now(): string;
}

export interface ControlledWorkflowStepResult {
  readonly state: JsonValue;
  /** Required for a newly completed meaningful effect. */
  readonly recordedEffect?: RecordedEffect;
}

export interface PassiveWorkflowStep {
  readonly stepId: StepId;
  readonly effect: "none";
  execute(state: JsonValue): MaybePromise<ControlledWorkflowStepResult>;
}

export interface ControlledWorkflowStep {
  readonly stepId: StepId;
  readonly effect: "meaningful";
  readonly action: BoundAction;
  execute(input: ControlledWorkflowStepExecuteInput): MaybePromise<ControlledWorkflowStepResult>;
}

export interface ControlledWorkflowStepExecuteInput {
  readonly state: JsonValue;
  readonly action: BoundAction;
  readonly started: RecordedEffect;
}

export type ResumableWorkflowStep = PassiveWorkflowStep | ControlledWorkflowStep;

export interface WorkflowSpecificationAuthority {
  readonly compiled: CompiledSpecification<WorkflowExecutionPlan>;
  readonly authority: SpecificationAuthorityDependencies;
}

export interface ResumeInterventionWorkflowInput {
  readonly checkpoint: RegisteredResumableCheckpoint;
  readonly intervention: InterventionRequest;
  readonly decision: InterventionDecision;
  readonly expectedCompatibility: ResumeCompatibility;
  readonly securityDomain: string;
  readonly actionDigestPort: ActionDigestPort;
  readonly authentication: InterventionAuthenticationPort;
  readonly clock: WorkflowClock;
  readonly journal: WorkflowResumeJournal;
  readonly steps: readonly ResumableWorkflowStep[];
  /** When present, runtime steps must match the compiled declarative target. */
  readonly specification?: WorkflowSpecificationAuthority;
}

export type ControlledWorkflowResult =
  | {
      readonly status: "completed";
      readonly state: JsonValue;
      readonly completedStepIds: readonly StepId[];
      readonly recordedEffects: readonly RecordedEffect[];
    }
  | { readonly status: "denied"; readonly reason?: string }
  | { readonly status: "deferred"; readonly resumeAfter?: string; readonly reason?: string }
  | {
      readonly status: "edit-requires-new-binding";
      readonly replacementArguments: JsonValue;
      readonly reason?: string;
    }
  | { readonly status: "cancelled"; readonly reason?: string }
  | {
      readonly status: "escalated";
      readonly escalateTo: InterventionDecision["actor"];
      readonly reason?: string;
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "action-verification-failed"
        | "authentication-failed"
        | "checkpoint-not-registered"
        | "decision-already-consumed"
        | "intervention-already-resolved"
        | "intervention-rejected"
        | "checkpoint-already-claimed"
        | "checkpoint-already-consumed"
        | "resume-coordination-failed"
        | "specification-authority-invalid";
    }
  | {
      readonly status: "incompatible";
      readonly reason: ResumeCompatibilityFailure | "workflow-shape-mismatch";
    }
  | {
      readonly status: "reconciliation-required";
      readonly stepId: StepId;
      readonly effectStatus: "started" | "indeterminate";
    }
  | {
      readonly status: "failed";
      readonly reason:
        | "execution-failed"
        | "effect-record-required"
        | "invalid-step-result"
        | "resume-persistence-failed"
        | "specification-authority-invalid";
      readonly stepId?: StepId;
    };
