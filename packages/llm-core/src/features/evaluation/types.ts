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
