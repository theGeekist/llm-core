import { maybeMap, maybeReduce, type MaybePromise } from "#shared/maybe";
import { createEvaluationCase } from "./case";
import {
  cloneFrozen,
  evidenceRefsEqual,
  hasExactKeys,
  isDenseArray,
  isEvidenceRef,
  isEvaluatorDescriptor,
  isPlainRecord,
  ownDataValue,
  portableBoundary,
  QUALIFIED_EVALUATION_ID,
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
  if (!isPlainRecord(value) || !hasExactKeys(value, ["descriptor", "evaluate"])) {
    throw new TypeError("Evaluators require a closed portable descriptor and callable evaluation.");
  }
  const descriptor = ownDataValue(value, "descriptor");
  const evaluate = ownDataValue(value, "evaluate");
  if (!isEvaluatorDescriptor(descriptor) || typeof evaluate !== "function") {
    throw new TypeError("Evaluators require a closed portable descriptor and callable evaluation.");
  }
  return {
    descriptor: cloneFrozen(descriptor as EvaluationEvaluatorDescriptor),
    evaluate: evaluate.bind(value) as EvaluationEvaluator["evaluate"],
  };
};

function assertScore(
  value: unknown,
  criteria: ReadonlySet<string>,
): asserts value is EvaluationScore {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["criterionId", "value"]) ||
    typeof value.criterionId !== "string" ||
    !QUALIFIED_EVALUATION_ID.test(value.criterionId) ||
    !criteria.has(value.criterionId) ||
    typeof value.value !== "number" ||
    !Number.isFinite(value.value) ||
    value.value < 0 ||
    value.value > 1
  ) {
    throw new TypeError("Evaluation scores must reference a case criterion and be within [0, 1].");
  }
}

const judgementResult = (
  evaluationCase: EvaluationCase,
  descriptor: EvaluationEvaluatorDescriptor,
  value: EvaluationJudgement,
): EvaluationResult =>
  portableBoundary("Evaluator judgements must be closed, portable, and evidence-linked.", () => {
    if (
      !isPlainRecord(value) ||
      !hasExactKeys(value, ["status", "scores", "explanations", "evidence"]) ||
      !["fail", "inconclusive", "pass"].includes(String(value.status)) ||
      !Array.isArray(value.scores) ||
      !isDenseArray(value.scores) ||
      (value.status !== "inconclusive" && value.scores.length === 0) ||
      !Array.isArray(value.explanations) ||
      !isDenseArray(value.explanations) ||
      value.explanations.length === 0 ||
      !value.explanations.every(
        (explanation) => typeof explanation === "string" && explanation.trim().length > 0,
      ) ||
      !Array.isArray(value.evidence) ||
      !isDenseArray(value.evidence) ||
      value.evidence.length === 0
    ) {
      throw new TypeError("Evaluator judgement shape is invalid.");
    }

    const criteria = new Set(evaluationCase.criteria.map(({ criterionId }) => criterionId));
    for (const score of value.scores) assertScore(score, criteria);
    if (new Set(value.scores.map(({ criterionId }) => criterionId)).size !== value.scores.length) {
      throw new TypeError("Evaluator judgements cannot contain duplicate criterion scores.");
    }

    const recorded = new Map(
      evaluationCase.evidence.map((evidence) => [evidence.evidenceId, evidence] as const),
    );
    for (const evidence of value.evidence) {
      if (!isEvidenceRef(evidence)) {
        throw new TypeError("Evaluator evidence must contain closed EvidenceRef values.");
      }
      const source = recorded.get(evidence.evidenceId);
      if (source === undefined || !evidenceRefsEqual(source, evidence)) {
        throw new TypeError("Evaluator results may only reference evidence recorded on the case.");
      }
    }
    if (
      new Set(value.evidence.map(({ evidenceId }) => evidenceId)).size !== value.evidence.length
    ) {
      throw new TypeError("Evaluator judgements cannot contain duplicate evidence references.");
    }

    return cloneFrozen({
      caseId: evaluationCase.caseId,
      evaluator: descriptor,
      status: value.status,
      scores: value.scores,
      explanations: value.explanations,
      evidence: value.evidence,
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
    if (!Array.isArray(evaluators) || !isDenseArray(evaluators) || evaluators.length === 0) {
      throw new TypeError("Evaluation composition requires at least one evaluator.");
    }
    const registered = evaluators.map(registerEvaluator).sort((left, right) => {
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
