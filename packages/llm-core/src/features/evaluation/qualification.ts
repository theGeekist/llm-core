import { isDigest, type EvidenceRef } from "#contracts";
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
  EvaluationAssertion,
  EvaluationCandidate,
  EvaluationCandidateLineage,
  EvaluationMeasuredResult,
  EvaluationPromotion,
  EvaluationPromotionInput,
  EvaluationQualification,
  EvaluationQualificationInput,
  EvaluationQualifiedInput,
  EvaluationResult,
  EvaluationSlice,
  EvaluationThreshold,
} from "./types";

const qualified = (value: unknown): value is string =>
  typeof value === "string" && QUALIFIED_EVALUATION_ID.test(value);

const evidence = (value: unknown): EvidenceRef[] | null => {
  const values = snapshotDenseArray(value);
  if (values === null || values.length === 0) return null;
  const snapshots = values.map(snapshotEvidenceRef);
  return snapshots.some((item) => item === null) ||
    new Set(snapshots.map((item) => item!.evidenceId)).size !== snapshots.length
    ? null
    : (snapshots as EvidenceRef[]);
};

const qualifiedInput = (value: unknown): EvaluationQualifiedInput | null => {
  const snapshot = snapshotExactRecord(value, ["id", "digest", "evidence"]);
  const refs = evidence(snapshot?.evidence);
  return snapshot !== null && qualified(snapshot.id) && isDigest(snapshot.digest) && refs !== null
    ? { id: snapshot.id, digest: snapshot.digest, evidence: refs }
    : null;
};

const candidate = (value: unknown): EvaluationCandidate | null => {
  const snapshot = snapshotExactRecord(value, ["id", "digest", "evidence", "lineage"]);
  const base = qualifiedInput(
    snapshot === null
      ? undefined
      : { id: snapshot.id, digest: snapshot.digest, evidence: snapshot.evidence },
  );
  const lineage = snapshotExactRecord(snapshot?.lineage, ["kind"], ["optimizer", "baseCandidate"]);
  if (base === null || lineage === null || !["manual", "optimizer"].includes(String(lineage.kind)))
    return null;
  const optimizer = lineage.optimizer === undefined ? undefined : qualifiedInput(lineage.optimizer);
  const baseCandidate =
    lineage.baseCandidate === undefined ? undefined : qualifiedInput(lineage.baseCandidate);
  if (
    (lineage.kind === "optimizer") !== (optimizer !== undefined) ||
    (lineage.kind === "optimizer" && baseCandidate === null) ||
    (lineage.kind === "manual" && lineage.baseCandidate !== undefined)
  )
    return null;
  return {
    ...base,
    lineage: {
      kind: lineage.kind as EvaluationCandidateLineage["kind"],
      ...(optimizer === null ? {} : { optimizer }),
      ...(baseCandidate === undefined || baseCandidate === null ? {} : { baseCandidate }),
    },
  };
};

const split = (value: unknown, datasetId: string): EvaluationSlice | null => {
  const snapshot = snapshotExactRecord(value, ["id", "digest", "evidence", "kind", "datasetId"]);
  const base = qualifiedInput(
    snapshot === null
      ? undefined
      : { id: snapshot.id, digest: snapshot.digest, evidence: snapshot.evidence },
  );
  return base !== null &&
    snapshot !== null &&
    snapshot.datasetId === datasetId &&
    ["training", "validation", "held-out"].includes(String(snapshot.kind))
    ? { ...base, datasetId, kind: snapshot.kind as EvaluationSlice["kind"] }
    : null;
};

const assertion = (value: unknown): EvaluationAssertion | null => {
  const snapshot = snapshotExactRecord(value, ["assertionId", "kind", "evidence"]);
  const refs = evidence(snapshot?.evidence);
  return snapshot !== null &&
    qualified(snapshot.assertionId) &&
    ["final-output", "safety", "tool-use", "trajectory"].includes(String(snapshot.kind)) &&
    refs !== null
    ? {
        assertionId: snapshot.assertionId,
        kind: snapshot.kind as EvaluationAssertion["kind"],
        evidence: refs,
      }
    : null;
};

const result = (value: unknown): EvaluationResult | null => {
  const snapshot = snapshotExactRecord(value, [
    "caseId",
    "evaluator",
    "status",
    "scores",
    "explanations",
    "evidence",
  ]);
  const evaluator = snapshotEvaluatorDescriptor(snapshot?.evaluator);
  const scores = snapshotDenseArray(snapshot?.scores);
  const explanations = snapshotDenseArray(snapshot?.explanations);
  const refs = evidence(snapshot?.evidence);
  if (
    snapshot === null ||
    !qualified(snapshot.caseId) ||
    evaluator === null ||
    !["pass", "fail", "inconclusive"].includes(String(snapshot.status)) ||
    scores === null ||
    explanations === null ||
    refs === null ||
    !scores.every((score) => {
      const item = snapshotExactRecord(score, ["criterionId", "value"]);
      return (
        item !== null &&
        qualified(item.criterionId) &&
        typeof item.value === "number" &&
        Number.isFinite(item.value) &&
        item.value >= 0 &&
        item.value <= 1
      );
    }) ||
    !explanations.every((item) => typeof item === "string" && item.trim().length > 0)
  )
    return null;
  const normalizedScores = scores.map(
    (score) => snapshotExactRecord(score, ["criterionId", "value"])!,
  ) as unknown as EvaluationResult["scores"];
  return {
    caseId: snapshot.caseId as EvaluationResult["caseId"],
    evaluator: evaluator as EvaluationResult["evaluator"],
    status: snapshot.status as EvaluationResult["status"],
    scores: normalizedScores,
    explanations: explanations as string[],
    evidence: refs,
  };
};

const measured = (value: unknown): EvaluationMeasuredResult | null => {
  const snapshot = snapshotExactRecord(value, ["result"], ["uncertainty"]);
  const normalized = result(snapshot?.result);
  return snapshot !== null &&
    normalized !== null &&
    (snapshot.uncertainty === undefined ||
      (typeof snapshot.uncertainty === "number" &&
        Number.isFinite(snapshot.uncertainty) &&
        snapshot.uncertainty >= 0 &&
        snapshot.uncertainty <= 1))
    ? {
        result: normalized,
        ...(snapshot.uncertainty === undefined ? {} : { uncertainty: snapshot.uncertainty }),
      }
    : null;
};

const threshold = (value: unknown): EvaluationThreshold | null => {
  const snapshot = snapshotExactRecord(value, ["criterionId", "minimum"]);
  return snapshot !== null &&
    qualified(snapshot.criterionId) &&
    typeof snapshot.minimum === "number" &&
    Number.isFinite(snapshot.minimum) &&
    snapshot.minimum >= 0 &&
    snapshot.minimum <= 1
    ? {
        criterionId: snapshot.criterionId as EvaluationThreshold["criterionId"],
        minimum: snapshot.minimum,
      }
    : null;
};

export const createEvaluationQualification = (
  input: EvaluationQualificationInput,
): EvaluationQualification =>
  portableBoundary("Evaluation qualifications require closed, reproducible evidence.", () => {
    const snapshot = snapshotExactRecord(input, [
      "dataset",
      "split",
      "baseline",
      "candidate",
      "evaluator",
      "results",
      "assertions",
      "thresholds",
    ]);
    const dataset = qualifiedInput(snapshot?.dataset);
    const evaluator = snapshotEvaluatorDescriptor(snapshot?.evaluator);
    const normalizedSplit = dataset === null ? null : split(snapshot?.split, dataset.id);
    const baseline = candidate(snapshot?.baseline);
    const next = candidate(snapshot?.candidate);
    const results = snapshotDenseArray(snapshot?.results)?.map(measured);
    const assertions = snapshotDenseArray(snapshot?.assertions)?.map(assertion);
    const thresholds = snapshotDenseArray(snapshot?.thresholds)?.map(threshold);
    if (
      !snapshot ||
      !dataset ||
      !evaluator ||
      !normalizedSplit ||
      !baseline ||
      !next ||
      baseline.id === next.id ||
      !results?.length ||
      results.some((item) => item === null) ||
      !assertions?.length ||
      assertions.some((item) => item === null) ||
      !thresholds?.length ||
      thresholds.some((item) => item === null) ||
      new Set(thresholds.map((item) => item!.criterionId)).size !== thresholds.length
    )
      throw new TypeError("Qualification facts are invalid.");
    if (
      next.lineage.kind === "optimizer" &&
      (next.lineage.baseCandidate?.id !== baseline.id ||
        next.lineage.baseCandidate?.digest.algorithm !== baseline.digest.algorithm ||
        next.lineage.baseCandidate?.digest.value !== baseline.digest.value)
    )
      throw new TypeError("Optimizer candidate lineage must bind the qualification baseline.");
    const normalizedResults = results as EvaluationMeasuredResult[];
    const normalizedThresholds = thresholds as EvaluationThreshold[];
    if (
      !normalizedResults.every(
        (item) =>
          item.result.evaluator.evaluatorId === evaluator.evaluatorId &&
          item.result.evaluator.version === evaluator.version,
      )
    )
      throw new TypeError("Qualification results must use the declared evaluator.");
    const scoreByCriterion = new Map(
      normalizedResults
        .flatMap((item) => item.result.scores)
        .map((score) => [score.criterionId, score.value]),
    );
    const thresholdStatus = normalizedThresholds.every(
      (item) => (scoreByCriterion.get(item.criterionId) ?? -1) >= item.minimum,
    )
      ? "qualified"
      : "not-qualified";
    return cloneFrozen({
      dataset,
      split: normalizedSplit,
      baseline,
      candidate: next,
      evaluator: evaluator as EvaluationResult["evaluator"],
      results: normalizedResults,
      assertions: assertions as EvaluationAssertion[],
      thresholds: normalizedThresholds,
      thresholdStatus,
    });
  });

export const createEvaluationPromotion = (input: EvaluationPromotionInput): EvaluationPromotion =>
  portableBoundary(
    "Promotions require held-out, measured qualification and accountable policy evidence.",
    () => {
      const snapshot = snapshotExactRecord(input, [
        "qualification",
        "policy",
        "decisionMaker",
        "decision",
      ]);
      const qualificationInput = snapshotExactRecord(
        snapshot?.qualification,
        [
          "dataset",
          "split",
          "baseline",
          "candidate",
          "evaluator",
          "results",
          "assertions",
          "thresholds",
        ],
        ["thresholdStatus"],
      );
      const rawQualification = { ...(qualificationInput ?? {}) };
      delete rawQualification.thresholdStatus;
      const qualification = createEvaluationQualification(
        rawQualification as unknown as EvaluationQualificationInput,
      );
      const policy = snapshotEvidenceRef(snapshot?.policy);
      if (
        !snapshot ||
        policy === null ||
        !qualified(snapshot.decisionMaker) ||
        !["promote", "reject"].includes(String(snapshot.decision)) ||
        qualification.split.kind !== "held-out" ||
        (snapshot.decision === "promote" && qualification.thresholdStatus !== "qualified")
      )
        throw new TypeError("Promotion facts are invalid.");
      if (
        !qualification.assertions
          .flatMap((item) => item.evidence)
          .some((item) => evidenceRefsEqual(item, policy))
      )
        throw new TypeError("Promotion policy evidence must be recorded by the qualification.");
      return cloneFrozen({
        qualification,
        policy,
        decisionMaker: snapshot.decisionMaker,
        decision: snapshot.decision as EvaluationPromotion["decision"],
      });
    },
  );
