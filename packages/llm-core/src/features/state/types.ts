import type {
  ContractVersion,
  Digest,
  DurableJobId,
  EvidenceRef,
  JsonValue,
  PrincipalRef,
  ProviderSessionId,
  RunId,
  SchemaRef,
  StepId,
} from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type { ActionDigest } from "../tooling/runtime";

declare const checkpointIdBrand: unique symbol;
declare const interventionIdBrand: unique symbol;
declare const interventionDecisionIdBrand: unique symbol;
declare const registeredCheckpointBrand: unique symbol;
declare const liveContinuationBrand: unique symbol;

export type CheckpointId = string & {
  readonly [checkpointIdBrand]: "CheckpointId";
};

export type InterventionId = string & {
  readonly [interventionIdBrand]: "InterventionId";
};

export type InterventionDecisionId = string & {
  readonly [interventionDecisionIdBrand]: "InterventionDecisionId";
};

/**
 * Process-local continuation. The nominal and runtime provenance markers are
 * deliberately unavailable to portable state constructors.
 */
export interface LiveContinuation<TValue> {
  readonly kind: "live-continuation";
  readonly value: TValue;
  readonly [liveContinuationBrand]: true;
  toJSON(): never;
}

/** Serializable observation with no resumability guarantee. */
export interface Snapshot {
  readonly kind: "snapshot";
  readonly snapshotId: string;
  readonly createdAt: string;
  readonly schema?: SchemaRef;
  readonly value: JsonValue;
}

export interface RuntimeCompatibility {
  readonly runtimeId: string;
  readonly runtimeVersion: ContractVersion;
}

export interface CheckpointFormatCompatibility {
  readonly formatId: string;
  readonly formatVersion: ContractVersion;
}

export interface NativeReferenceCompatibility {
  readonly namespace: string;
  readonly referenceType: string;
  readonly compatibilityKey: string;
}

export interface ResumeCompatibility {
  readonly runtime: RuntimeCompatibility;
  readonly contractSchema: SchemaRef;
  readonly codeDigest: Digest;
  readonly checkpointFormat: CheckpointFormatCompatibility;
  readonly nativeReferences: readonly NativeReferenceCompatibility[];
}

export type RecordedEffectStatus = "completed" | "started" | "indeterminate";

export interface RecordedEffect {
  readonly stepId: StepId;
  readonly actionDigest: ActionDigest;
  readonly status: RecordedEffectStatus;
  readonly receipt: EvidenceRef;
}

/** Portable accepted-decision binding retained by a specification-derived checkpoint. */
export interface SpecificationDecisionBinding {
  readonly recordId: string;
  readonly authority: string;
  readonly resolvedDigest: Digest;
  readonly acceptedScope: readonly string[];
  readonly policyVersions: readonly {
    readonly policyId: string;
    readonly version: ContractVersion;
  }[];
  readonly sources: readonly {
    readonly sourceId: string;
    readonly revision: string;
    readonly contentDigest: Digest;
  }[];
}

export interface ResumableCheckpoint {
  readonly kind: "resumable-checkpoint";
  readonly checkpointId: CheckpointId;
  readonly runId: RunId;
  readonly revision: number;
  readonly createdAt: string;
  readonly compatibility: ResumeCompatibility;
  readonly completedStepIds: readonly StepId[];
  readonly recordedEffects: readonly RecordedEffect[];
  readonly state: JsonValue;
  /** Requires a matching registered compilation before durable workflow resume. */
  readonly specification?: SpecificationDecisionBinding;
}

export interface RegisteredResumableCheckpoint extends ResumableCheckpoint {
  readonly [registeredCheckpointBrand]: true;
}

/** Opaque external-runtime identity; never passed to local checkpoint resume. */
export interface DurableExecutionHandle {
  readonly kind: "durable-execution-handle";
  readonly durableJobId: DurableJobId;
  readonly runtime: RuntimeCompatibility;
  readonly opaqueHandle: string;
}

/** Opaque provider conversation continuity; not resumable workflow state. */
export interface ProviderSessionRef {
  readonly kind: "provider-session-ref";
  readonly providerId: string;
  readonly sessionId: ProviderSessionId;
}

export type InterventionKind = "approve" | "deny" | "defer" | "edit" | "cancel" | "escalate";

export interface InterventionRef {
  readonly interventionId: InterventionId;
  readonly checkpointId: CheckpointId;
  readonly checkpointRevision: number;
  readonly runId: RunId;
  readonly stepId: StepId;
  readonly actionDigest: ActionDigest;
}

export interface InterventionRequest {
  readonly intervention: InterventionRef;
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly allowed: readonly InterventionKind[];
  readonly reason?: string;
}

export interface InterventionAuthenticationRef {
  readonly scheme: string;
  readonly evidence: EvidenceRef;
}

export type InterventionAuthenticationResult =
  | { readonly status: "authenticated"; readonly principal: PrincipalRef }
  | { readonly status: "rejected" };

export interface VerifyInterventionAuthenticationInput {
  readonly request: InterventionRequest;
  readonly decision: InterventionDecision;
}

export interface InterventionAuthenticationPort {
  verify(
    input: VerifyInterventionAuthenticationInput,
  ): MaybePromise<InterventionAuthenticationResult>;
}

interface InterventionDecisionBase {
  readonly decisionId: InterventionDecisionId;
  readonly intervention: InterventionRef;
  readonly decidedAt: string;
  readonly actor: PrincipalRef;
  readonly authentication: InterventionAuthenticationRef;
  readonly reason?: string;
}

export interface ApproveInterventionDecision extends InterventionDecisionBase {
  readonly decision: "approve";
}

export interface DenyInterventionDecision extends InterventionDecisionBase {
  readonly decision: "deny";
}

export interface DeferInterventionDecision extends InterventionDecisionBase {
  readonly decision: "defer";
  readonly resumeAfter?: string;
}

export interface EditInterventionDecision extends InterventionDecisionBase {
  readonly decision: "edit";
  readonly replacementArguments: JsonValue;
}

export interface CancelInterventionDecision extends InterventionDecisionBase {
  readonly decision: "cancel";
}

export interface EscalateInterventionDecision extends InterventionDecisionBase {
  readonly decision: "escalate";
  readonly escalateTo: PrincipalRef;
}

export type InterventionDecision =
  | ApproveInterventionDecision
  | DenyInterventionDecision
  | DeferInterventionDecision
  | EditInterventionDecision
  | CancelInterventionDecision
  | EscalateInterventionDecision;

export type ResumeStrategy =
  | { readonly kind: "continue-from-checkpoint" }
  | { readonly kind: "signal-durable-execution"; readonly handle: DurableExecutionHandle }
  | { readonly kind: "continue-provider-session"; readonly session: ProviderSessionRef };
