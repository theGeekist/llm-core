import type { ContractVersion, Digest } from "#contracts";
import type { MaybePromise } from "#shared/maybe";
import type {
  ConversionIssue,
  SpecificationDecision,
  SpecificationDecisionRecord,
  SpecificationGraph,
  SpecificationNodeId,
  SpecificationPolicyVersion,
  SpecificationQuestion,
  SpecificationRelationshipId,
  SpecificationSourceRevisionBinding,
} from "../../features/specifications/types";

declare const acceptedSpecificationHandleBrand: unique symbol;
declare const compiledSpecificationBrand: unique symbol;
declare const specificationCompilationIdBrand: unique symbol;

export type SpecificationCompilationId = string & {
  readonly [specificationCompilationIdBrand]: "SpecificationCompilationId";
};

export interface SpecificationAuthorityState {
  readonly authority: string;
  readonly resolvedDigest: Digest;
  readonly acceptedScope: readonly SpecificationNodeId[];
  readonly policyVersions: readonly SpecificationPolicyVersion[];
  readonly sources: readonly SpecificationSourceRevisionBinding[];
}

export interface CompilationAuthoritySnapshot extends SpecificationAuthorityState {
  readonly checkedAt: string;
}

export interface SpecificationAuthorityStatePort {
  current(input: {
    readonly record: SpecificationDecisionRecord;
    readonly graph: SpecificationGraph;
  }): MaybePromise<SpecificationAuthorityState>;
}

export interface TrustedSpecificationClock {
  now(): string;
}

export interface SpecificationAuthorityDependencies {
  readonly currentState: SpecificationAuthorityStatePort;
  readonly clock: TrustedSpecificationClock;
}

/** Process-local provenance that a portable accepted record cannot reconstruct. */
export interface AcceptedSpecificationHandle {
  readonly record: SpecificationDecisionRecord;
  readonly graph: SpecificationGraph;
  readonly [acceptedSpecificationHandleBrand]: true;
}

export interface RegisterAcceptedSpecificationInput {
  readonly graph: SpecificationGraph;
  readonly decision: SpecificationDecision;
  readonly authority: SpecificationAuthorityDependencies;
}

export interface SpecificationDependencyPlan {
  readonly orderedNodeIds: readonly SpecificationNodeId[];
  readonly relationshipIds: readonly SpecificationRelationshipId[];
  readonly blockedNodeIds: readonly SpecificationNodeId[];
}

export interface SpecificationWorkflowPlan {
  readonly nodeIds: readonly SpecificationNodeId[];
  readonly relationshipIds: readonly SpecificationRelationshipId[];
}

/** A deterministic plan with no provider, adapter, or execution authority. */
export interface TargetNeutralCompiledPlan {
  readonly version: ContractVersion;
  readonly acceptedScope: readonly SpecificationNodeId[];
  readonly dependency: SpecificationDependencyPlan;
  readonly workflow: SpecificationWorkflowPlan;
}

export interface SpecificationReview {
  readonly graph: SpecificationGraph;
  readonly dependency: SpecificationDependencyPlan;
  readonly workflow: SpecificationWorkflowPlan;
  readonly decision: SpecificationDecision;
  readonly issues: readonly ConversionIssue[];
  readonly questions: readonly SpecificationQuestion[];
}

export interface ReviewSpecificationInput {
  readonly graph: SpecificationGraph;
  readonly decision?: SpecificationDecision;
}

export interface SpecificationTargetCompiler<T> {
  compile(input: {
    readonly accepted: AcceptedSpecificationHandle;
    readonly plan: TargetNeutralCompiledPlan;
  }): MaybePromise<T>;
}

export interface CompiledSpecification<T> {
  readonly compilationId: SpecificationCompilationId;
  readonly value: T;
  readonly accepted: AcceptedSpecificationHandle;
  readonly authority: CompilationAuthoritySnapshot;
  readonly [compiledSpecificationBrand]: true;
}

export interface CompileSpecificationInput<T> {
  readonly accepted: AcceptedSpecificationHandle;
  readonly authority: SpecificationAuthorityDependencies;
  readonly compiler: SpecificationTargetCompiler<T>;
}

export interface VerifyCompilationAuthorityInput<T> {
  readonly compiled: CompiledSpecification<T>;
  readonly authority: SpecificationAuthorityDependencies;
}
