import {
  cloneFrozen,
  hasExactKeys,
  isDenseArray,
  isEvidenceRef,
  isPlainRecord,
  portableBoundary,
  QUALIFIED_EVALUATION_ID,
} from "./portable";
import type {
  EvaluationCase,
  EvaluationCaseId,
  EvaluationCaseInput,
  EvaluationCriterion,
  EvaluationCriterionId,
  EvaluationEvaluatorId,
} from "./types";

function assertQualifiedId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !QUALIFIED_EVALUATION_ID.test(value)) {
    throw new TypeError(`${label} must use lowercase reverse-DNS notation.`);
  }
}

export const evaluationCaseId = (value: string): EvaluationCaseId => {
  assertQualifiedId(value, "Evaluation case IDs");
  return value as EvaluationCaseId;
};

export const evaluationCriterionId = (value: string): EvaluationCriterionId => {
  assertQualifiedId(value, "Evaluation criterion IDs");
  return value as EvaluationCriterionId;
};

export const evaluationEvaluatorId = (value: string): EvaluationEvaluatorId => {
  assertQualifiedId(value, "Evaluation evaluator IDs");
  return value as EvaluationEvaluatorId;
};

function assertCriterion(value: unknown): asserts value is EvaluationCriterion {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["criterionId", "description", "weight"]) ||
    typeof value.criterionId !== "string" ||
    !QUALIFIED_EVALUATION_ID.test(value.criterionId) ||
    typeof value.description !== "string" ||
    value.description.trim().length === 0 ||
    typeof value.weight !== "number" ||
    !Number.isFinite(value.weight) ||
    value.weight <= 0 ||
    value.weight > 1
  ) {
    throw new TypeError(
      "Evaluation criteria require a qualified ID, non-empty description, and weight in (0, 1].",
    );
  }
}

const createEvaluationCaseUnchecked = (input: EvaluationCaseInput): EvaluationCase => {
  if (
    !isPlainRecord(input) ||
    !hasExactKeys(input, ["caseId", "criteria", "evidence"]) ||
    typeof input.caseId !== "string" ||
    !QUALIFIED_EVALUATION_ID.test(input.caseId) ||
    !Array.isArray(input.criteria) ||
    !isDenseArray(input.criteria) ||
    input.criteria.length === 0 ||
    !Array.isArray(input.evidence) ||
    !isDenseArray(input.evidence) ||
    input.evidence.length === 0
  ) {
    throw new TypeError("Evaluation cases must be closed and reference recorded evidence.");
  }
  for (const criterion of input.criteria) assertCriterion(criterion);
  for (const evidence of input.evidence) {
    if (!isEvidenceRef(evidence)) {
      throw new TypeError("Evaluation case evidence must contain closed EvidenceRef values.");
    }
  }
  if (
    new Set(input.criteria.map(({ criterionId }) => criterionId)).size !== input.criteria.length
  ) {
    throw new TypeError("Evaluation cases cannot contain duplicate criterion IDs.");
  }
  if (new Set(input.evidence.map(({ evidenceId }) => evidenceId)).size !== input.evidence.length) {
    throw new TypeError("Evaluation cases cannot contain duplicate evidence IDs.");
  }
  return cloneFrozen(input);
};

export const createEvaluationCase = (input: EvaluationCaseInput): EvaluationCase =>
  portableBoundary(
    "Evaluation cases must be closed, portable, and reference recorded evidence.",
    () => createEvaluationCaseUnchecked(input),
  );
