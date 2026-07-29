import type { EvidenceRef } from "#contracts";
import {
  cloneFrozen,
  portableBoundary,
  QUALIFIED_EVALUATION_ID,
  snapshotDenseArray,
  snapshotEvidenceRef,
  snapshotExactRecord,
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

const snapshotCriterion = (value: unknown): EvaluationCriterion | null => {
  const snapshot = snapshotExactRecord(value, ["criterionId", "description", "weight"]);
  if (
    snapshot === null ||
    typeof snapshot.criterionId !== "string" ||
    !QUALIFIED_EVALUATION_ID.test(snapshot.criterionId) ||
    typeof snapshot.description !== "string" ||
    snapshot.description.trim().length === 0 ||
    typeof snapshot.weight !== "number" ||
    !Number.isFinite(snapshot.weight) ||
    snapshot.weight <= 0 ||
    snapshot.weight > 1
  ) {
    return null;
  }
  return {
    criterionId: snapshot.criterionId as EvaluationCriterionId,
    description: snapshot.description,
    weight: snapshot.weight,
  };
};

const createEvaluationCaseUnchecked = (input: EvaluationCaseInput): EvaluationCase => {
  const snapshot = snapshotExactRecord(input, ["caseId", "criteria", "evidence"]);
  const criteriaValues = snapshotDenseArray(snapshot?.criteria);
  const evidenceValues = snapshotDenseArray(snapshot?.evidence);
  if (
    snapshot === null ||
    typeof snapshot.caseId !== "string" ||
    !QUALIFIED_EVALUATION_ID.test(snapshot.caseId) ||
    criteriaValues === null ||
    criteriaValues.length === 0 ||
    evidenceValues === null ||
    evidenceValues.length === 0
  ) {
    throw new TypeError("Evaluation cases must be closed and reference recorded evidence.");
  }
  const criteria = criteriaValues.map(snapshotCriterion);
  if (criteria.some((criterion) => criterion === null)) {
    throw new TypeError(
      "Evaluation criteria require a qualified ID, non-empty description, and weight in (0, 1].",
    );
  }
  const evidence = evidenceValues.map(snapshotEvidenceRef);
  if (evidence.some((item) => item === null)) {
    throw new TypeError("Evaluation case evidence must contain closed EvidenceRef values.");
  }
  const normalizedCriteria = criteria as EvaluationCriterion[];
  const normalizedEvidence = evidence as EvidenceRef[];
  if (new Set(normalizedCriteria.map(({ criterionId }) => criterionId)).size !== criteria.length) {
    throw new TypeError("Evaluation cases cannot contain duplicate criterion IDs.");
  }
  if (
    new Set(normalizedEvidence.map(({ evidenceId }) => evidenceId)).size !==
    normalizedEvidence.length
  ) {
    throw new TypeError("Evaluation cases cannot contain duplicate evidence IDs.");
  }
  return cloneFrozen({
    caseId: snapshot.caseId as EvaluationCaseId,
    criteria: normalizedCriteria,
    evidence: normalizedEvidence,
  });
};

export const createEvaluationCase = (input: EvaluationCaseInput): EvaluationCase =>
  portableBoundary(
    "Evaluation cases must be closed, portable, and reference recorded evidence.",
    () => createEvaluationCaseUnchecked(input),
  );
