import { maybeMap, maybeReduce, type MaybePromise } from "#shared/maybe";
import { createEvaluationCase } from "./case";
import {
  cloneFrozen,
  evidenceRefsEqual,
  portableBoundary,
  QUALIFIED_EVALUATION_ID,
  snapshotDenseArray,
  snapshotEvaluatorDescriptor,
  snapshotEvidenceRef,
  snapshotExactRecord,
} from "./portable";
import type {
  EvaluationCase,
  EvaluationComposition,
  EvaluationEvaluator,
  EvaluationEvaluatorDescriptor,
  EvaluationJudgement,
  EvaluationResult,
  EvaluationScore,
} from "./types";

interface RegisteredEvaluator {
  readonly descriptor: EvaluationEvaluatorDescriptor;
  readonly evaluate: EvaluationEvaluator["evaluate"];
}

const descriptorKey = (descriptor: EvaluationEvaluatorDescriptor): string =>
  `${descriptor.evaluatorId}@${descriptor.version}`;

const registerEvaluator = (value: EvaluationEvaluator): RegisteredEvaluator => {
  const snapshot = snapshotExactRecord(value, ["descriptor", "evaluate"]);
  if (snapshot === null) {
    throw new TypeError("Evaluators require a closed portable descriptor and callable evaluation.");
  }
  const descriptor = snapshotEvaluatorDescriptor(snapshot.descriptor);
  if (descriptor === null || typeof snapshot.evaluate !== "function") {
    throw new TypeError("Evaluators require a closed portable descriptor and callable evaluation.");
  }
  const evaluate = snapshot.evaluate as EvaluationEvaluator["evaluate"];
  return {
    descriptor: cloneFrozen(descriptor as EvaluationEvaluatorDescriptor),
    evaluate: (evaluationCase) => Reflect.apply(evaluate, value, [evaluationCase]),
  };
};

const snapshotScore = (value: unknown, criteria: ReadonlySet<string>): EvaluationScore | null => {
  const snapshot = snapshotExactRecord(value, ["criterionId", "value"]);
  if (
    snapshot === null ||
    typeof snapshot.criterionId !== "string" ||
    !QUALIFIED_EVALUATION_ID.test(snapshot.criterionId) ||
    !criteria.has(snapshot.criterionId) ||
    typeof snapshot.value !== "number" ||
    !Number.isFinite(snapshot.value) ||
    snapshot.value < 0 ||
    snapshot.value > 1
  ) {
    return null;
  }
  return {
    criterionId: snapshot.criterionId as EvaluationScore["criterionId"],
    value: snapshot.value,
  };
};

const judgementResult = (
  evaluationCase: EvaluationCase,
  descriptor: EvaluationEvaluatorDescriptor,
  value: EvaluationJudgement,
): EvaluationResult =>
  portableBoundary("Evaluator judgements must be closed, portable, and evidence-linked.", () => {
    const snapshot = snapshotExactRecord(value, ["status", "scores", "explanations", "evidence"]);
    const scoreValues = snapshotDenseArray(snapshot?.scores);
    const explanationValues = snapshotDenseArray(snapshot?.explanations);
    const evidenceValues = snapshotDenseArray(snapshot?.evidence);
    if (
      snapshot === null ||
      !["fail", "inconclusive", "pass"].includes(String(snapshot.status)) ||
      scoreValues === null ||
      (snapshot.status !== "inconclusive" && scoreValues.length === 0) ||
      explanationValues === null ||
      explanationValues.length === 0 ||
      !explanationValues.every(
        (explanation) => typeof explanation === "string" && explanation.trim().length > 0,
      ) ||
      evidenceValues === null ||
      evidenceValues.length === 0
    ) {
      throw new TypeError("Evaluator judgement shape is invalid.");
    }

    const criteria = new Set(evaluationCase.criteria.map(({ criterionId }) => criterionId));
    const scores = scoreValues.map((score) => snapshotScore(score, criteria));
    if (scores.some((score) => score === null)) {
      throw new TypeError(
        "Evaluation scores must reference a case criterion and be within [0, 1].",
      );
    }
    const normalizedScores = scores as EvaluationScore[];
    if (
      new Set(normalizedScores.map(({ criterionId }) => criterionId)).size !==
      normalizedScores.length
    ) {
      throw new TypeError("Evaluator judgements cannot contain duplicate criterion scores.");
    }

    const recorded = new Map(
      evaluationCase.evidence.map((evidence) => [evidence.evidenceId, evidence] as const),
    );
    const evidence = evidenceValues.map(snapshotEvidenceRef);
    if (evidence.some((item) => item === null)) {
      throw new TypeError("Evaluator evidence must contain closed EvidenceRef values.");
    }
    const normalizedEvidence = evidence as EvaluationResult["evidence"];
    for (const item of normalizedEvidence) {
      const source = recorded.get(item.evidenceId);
      if (source === undefined || !evidenceRefsEqual(source, item)) {
        throw new TypeError("Evaluator results may only reference evidence recorded on the case.");
      }
    }
    if (
      new Set(normalizedEvidence.map(({ evidenceId }) => evidenceId)).size !==
      normalizedEvidence.length
    ) {
      throw new TypeError("Evaluator judgements cannot contain duplicate evidence references.");
    }

    return cloneFrozen({
      caseId: evaluationCase.caseId,
      evaluator: descriptor,
      status: snapshot.status as EvaluationResult["status"],
      scores: normalizedScores,
      explanations: explanationValues as readonly string[],
      evidence: normalizedEvidence,
    });
  });

const evaluateOne = (
  evaluationCase: EvaluationCase,
  results: readonly EvaluationResult[],
  evaluator: RegisteredEvaluator,
): MaybePromise<readonly EvaluationResult[]> =>
  maybeMap(
    (judgement) => [...results, judgementResult(evaluationCase, evaluator.descriptor, judgement)],
    evaluator.evaluate(evaluationCase),
  );

const evaluateRegistered = (
  evaluators: readonly RegisteredEvaluator[],
  evaluationCase: EvaluationCase,
): MaybePromise<readonly EvaluationResult[]> => {
  const safeCase = createEvaluationCase(evaluationCase);
  return maybeMap(
    cloneFrozen,
    maybeReduce(
      (results, evaluator) => evaluateOne(safeCase, results, evaluator),
      [] as readonly EvaluationResult[],
      evaluators,
    ),
  );
};

export const createEvaluationComposition = (
  evaluators: readonly EvaluationEvaluator[],
): EvaluationComposition =>
  portableBoundary("Evaluation composition requires unique, descriptor-safe evaluators.", () => {
    const evaluatorValues = snapshotDenseArray(evaluators);
    if (evaluatorValues === null || evaluatorValues.length === 0) {
      throw new TypeError("Evaluation composition requires at least one evaluator.");
    }
    const registered = evaluatorValues
      .map((evaluator) => registerEvaluator(evaluator as EvaluationEvaluator))
      .sort((left, right) => {
        const leftKey = descriptorKey(left.descriptor);
        const rightKey = descriptorKey(right.descriptor);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
    if (
      new Set(registered.map(({ descriptor }) => descriptorKey(descriptor))).size !==
      registered.length
    ) {
      throw new TypeError("Evaluation composition cannot contain duplicate evaluator versions.");
    }
    const descriptors = cloneFrozen(registered.map(({ descriptor }) => descriptor));
    return Object.freeze({
      evaluators: descriptors,
      evaluate: (evaluationCase: EvaluationCase) => evaluateRegistered(registered, evaluationCase),
    });
  });
