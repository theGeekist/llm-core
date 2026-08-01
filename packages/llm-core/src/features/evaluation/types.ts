import type { ContractVersion, EvidenceRef } from "#contracts";
import type { MaybePromise } from "#shared/maybe";

declare const evaluationCaseIdBrand: unique symbol;
declare const evaluationCriterionIdBrand: unique symbol;
declare const evaluationEvaluatorIdBrand: unique symbol;

export type EvaluationCaseId = string & {
  readonly [evaluationCaseIdBrand]: "EvaluationCaseId";
};

export type EvaluationCriterionId = string & {
  readonly [evaluationCriterionIdBrand]: "EvaluationCriterionId";
};

export type EvaluationEvaluatorId = string & {
  readonly [evaluationEvaluatorIdBrand]: "EvaluationEvaluatorId";
};

export interface EvaluationCriterion {
  readonly criterionId: EvaluationCriterionId;
  readonly description: string;
  readonly weight: number;
}

export interface EvaluationCase {
  readonly caseId: EvaluationCaseId;
  readonly criteria: readonly EvaluationCriterion[];
  readonly evidence: readonly EvidenceRef[];
}

export interface EvaluationCaseInput {
  readonly caseId: EvaluationCaseId;
  readonly criteria: readonly EvaluationCriterion[];
  readonly evidence: readonly EvidenceRef[];
}

export interface EvaluationEvaluatorDescriptor {
  readonly evaluatorId: EvaluationEvaluatorId;
  readonly version: ContractVersion;
}

export type EvaluationStatus = "fail" | "inconclusive" | "pass";

export interface EvaluationScore {
  readonly criterionId: EvaluationCriterionId;
  /** A finite normalized score in the inclusive range 0–1. */
  readonly value: number;
}

/**
 * A provider-neutral evaluator decision. Composition binds this decision to
 * the evaluator descriptor and case identity.
 */
export interface EvaluationJudgement {
  readonly status: EvaluationStatus;
  readonly scores: readonly EvaluationScore[];
  readonly explanations: readonly string[];
  readonly evidence: readonly EvidenceRef[];
}

export interface EvaluationResult {
  readonly caseId: EvaluationCaseId;
  readonly evaluator: EvaluationEvaluatorDescriptor;
  readonly status: EvaluationStatus;
  readonly scores: readonly EvaluationScore[];
  readonly explanations: readonly string[];
  readonly evidence: readonly EvidenceRef[];
}

export interface EvaluationEvaluator {
  readonly descriptor: EvaluationEvaluatorDescriptor;
  evaluate(evaluationCase: EvaluationCase): MaybePromise<EvaluationJudgement>;
}

export interface EvaluationComposition {
  readonly evaluators: readonly EvaluationEvaluatorDescriptor[];
  evaluate(evaluationCase: EvaluationCase): MaybePromise<readonly EvaluationResult[]>;
}

/** Immutable, evidence-addressed input used for a reproducible qualification. */
export interface EvaluationQualifiedInput {
  readonly id: string;
  readonly digest: import("#contracts").Digest;
  readonly evidence: readonly EvidenceRef[];
}

export type EvaluationAssertionKind = "final-output" | "safety" | "tool-use" | "trajectory";

export interface EvaluationAssertion {
  readonly assertionId: string;
  readonly kind: EvaluationAssertionKind;
  readonly evidence: readonly EvidenceRef[];
}

export interface EvaluationSlice extends EvaluationQualifiedInput {
  readonly kind: "training" | "validation" | "held-out";
  readonly datasetId: string;
}

export interface EvaluationCandidateLineage {
  readonly kind: "manual" | "optimizer";
  readonly optimizer?: EvaluationQualifiedInput;
  /** Required for optimizer output and bound to the exact qualification baseline revision. */
  readonly baseCandidate?: EvaluationQualifiedInput;
}

export interface EvaluationCandidate extends EvaluationQualifiedInput {
  readonly lineage: EvaluationCandidateLineage;
}

export interface EvaluationThreshold {
  readonly criterionId: EvaluationCriterionId;
  readonly minimum: number;
}

export interface EvaluationMeasuredResult {
  readonly result: EvaluationResult;
  /** Present only when this evaluator defines a normalized uncertainty value. */
  readonly uncertainty?: number;
}

export interface EvaluationQualificationInput {
  readonly dataset: EvaluationQualifiedInput;
  readonly split: EvaluationSlice;
  readonly baseline: EvaluationCandidate;
  readonly candidate: EvaluationCandidate;
  readonly evaluator: EvaluationEvaluatorDescriptor;
  readonly results: readonly EvaluationMeasuredResult[];
  readonly assertions: readonly EvaluationAssertion[];
  readonly thresholds: readonly EvaluationThreshold[];
}

export interface EvaluationQualification extends EvaluationQualificationInput {
  readonly thresholdStatus: "not-qualified" | "qualified";
}

export interface EvaluationPromotionInput {
  readonly qualification: EvaluationQualification;
  readonly policy: EvidenceRef;
  readonly decisionMaker: string;
  readonly decision: "promote" | "reject";
}

export interface EvaluationPromotion extends EvaluationPromotionInput {}
