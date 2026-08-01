import { describe, expect, test } from "bun:test";
import {
  contractVersion,
  digest,
  newCoreId,
  type EvidenceId,
  type EvidenceRef,
  type ResourceId,
} from "#contracts";
import { isPromiseLike } from "#shared/maybe";
import {
  createEvaluationCase,
  createEvaluationComposition,
  createEvaluationPromotion,
  createEvaluationQualification,
  evaluationCaseId,
  evaluationCriterionId,
  evaluationEvaluatorId,
  type EvaluationCase,
  type EvaluationEvaluator,
  type EvaluationJudgement,
} from "../../src/features/evaluation/public";

const correctness = evaluationCriterionId("dev.llm-core.correctness");
const safety = evaluationCriterionId("dev.llm-core.safety");

const evidenceRef = (suffix: string, kind: EvidenceRef["kind"] = "event-payload"): EvidenceRef => ({
  evidenceId: newCoreId<EvidenceId>(`0190bd0c-0000-7000-8000-00000000${suffix}`),
  kind,
  content: {
    resourceId: newCoreId<ResourceId>(`0190bd0c-0000-7000-8001-00000000${suffix}`),
    mediaType: "application/json",
    byteLength: 42,
    digest: digest(suffix.padStart(64, "0")),
  },
});

const evidence = [evidenceRef("2201"), evidenceRef("2202", "execution-receipt")];

const evaluationCase = (): EvaluationCase =>
  createEvaluationCase({
    caseId: evaluationCaseId("dev.llm-core.case.tool-safety"),
    criteria: [
      { criterionId: correctness, description: "The recorded output is correct.", weight: 0.6 },
      { criterionId: safety, description: "The recorded effects are safe.", weight: 0.4 },
    ],
    evidence,
  });

const evaluator = (
  id: string,
  evaluate: EvaluationEvaluator["evaluate"],
  version = "1.0.0",
): EvaluationEvaluator => ({
  descriptor: {
    evaluatorId: evaluationEvaluatorId(id),
    version: contractVersion(version),
  },
  evaluate,
});

const pass = (source: EvidenceRef = evidence[0]!): EvaluationJudgement => ({
  status: "pass",
  scores: [{ criterionId: correctness, value: 1 }],
  explanations: ["Recorded evidence satisfies the criterion."],
  evidence: [source],
});

describe("evaluation domain", () => {
  test("binds promotion to validated held-out measurements, thresholds, and lineage", () => {
    const identity = (id: string) => ({
      id,
      digest: digest("3".repeat(64)),
      evidence: [evidence[0]!],
    });
    const baselineReference = identity("dev.llm-core.candidate.baseline");
    const baseline = { ...baselineReference, lineage: { kind: "manual" as const } };
    const qualification = createEvaluationQualification({
      dataset: identity("dev.llm-core.dataset.release"),
      split: {
        ...identity("dev.llm-core.split.heldout"),
        kind: "held-out",
        datasetId: "dev.llm-core.dataset.release",
      },
      baseline,
      candidate: {
        ...identity("dev.llm-core.candidate.optimized"),
        lineage: {
          kind: "optimizer",
          optimizer: identity("dev.llm-core.optimizer.search"),
          baseCandidate: baselineReference,
        },
      },
      evaluator: evaluator("dev.llm-core.evaluator.gate", () => pass()).descriptor,
      results: [
        {
          result: {
            ...pass(),
            caseId: evaluationCase().caseId,
            evaluator: evaluator("dev.llm-core.evaluator.gate", () => pass()).descriptor,
          },
          uncertainty: 0.1,
        },
      ],
      assertions: [
        { assertionId: "dev.llm-core.assertion.safety", kind: "safety", evidence: [evidence[0]!] },
      ],
      thresholds: [{ criterionId: correctness, minimum: 0.9 }],
    });
    expect(qualification.thresholdStatus).toBe("qualified");
    expect(
      createEvaluationPromotion({
        qualification,
        policy: evidence[0]!,
        decisionMaker: "dev.llm-core.release.owner",
        decision: "promote",
      }).decision,
    ).toBe("promote");
    expect(() =>
      createEvaluationQualification({
        ...qualification,
        results: [
          {
            ...qualification.results[0]!,
            result: {
              ...qualification.results[0]!.result,
              scores: [{ notACriterion: "accepted" }],
              explanations: [42],
            },
          },
        ],
      } as never),
    ).toThrow("closed, reproducible");
    expect(() =>
      createEvaluationPromotion({
        qualification: { ...qualification, split: { ...qualification.split, kind: "validation" } },
        policy: evidence[0]!,
        decisionMaker: "dev.llm-core.release.owner",
        decision: "promote",
      }),
    ).toThrow("held-out");
    expect(() =>
      createEvaluationQualification({
        ...qualification,
        baseline: { ...baseline, digest: digest("4".repeat(64)) },
      }),
    ).toThrow("closed, reproducible");
  });
  test("creates immutable evidence-only cases without runtime or provider values", () => {
    const source = {
      caseId: evaluationCaseId("dev.llm-core.case.portability"),
      criteria: [{ criterionId: correctness, description: "Portable.", weight: 1 }],
      evidence: [{ ...evidence[0]!, content: { ...evidence[0]!.content } }],
    };
    const created = createEvaluationCase(source);
    source.criteria[0]!.description = "mutated";
    source.evidence[0]!.content.byteLength = 999;

    expect(Object.keys(created).sort()).toEqual(["caseId", "criteria", "evidence"]);
    expect(created.criteria[0]?.description).toBe("Portable.");
    expect(created.evidence[0]?.content.byteLength).toBe(42);
    expect(Object.isFrozen(created.evidence[0]?.content)).toBe(true);
  });

  test("composes synchronous evaluators deterministically and preserves sync", () => {
    const calls: string[] = [];
    const composition = createEvaluationComposition([
      evaluator("dev.llm-core.evaluator.zeta", (input) => {
        calls.push(`zeta:${input.evidence.length}`);
        return pass(input.evidence[1]);
      }),
      evaluator("dev.llm-core.evaluator.alpha", (input) => {
        calls.push(`alpha:${input.evidence.length}`);
        return pass(input.evidence[0]);
      }),
    ]);

    const result = composition.evaluate(evaluationCase());
    expect(isPromiseLike(result)).toBe(false);
    expect(calls).toEqual(["alpha:2", "zeta:2"]);
    expect(result).toMatchObject([
      {
        caseId: "dev.llm-core.case.tool-safety",
        evaluator: { evaluatorId: "dev.llm-core.evaluator.alpha", version: "1.0.0" },
        status: "pass",
      },
      {
        evaluator: { evaluatorId: "dev.llm-core.evaluator.zeta", version: "1.0.0" },
        status: "pass",
      },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("becomes async only at an async evaluator while retaining deterministic order", async () => {
    const composition = createEvaluationComposition([
      evaluator("dev.llm-core.evaluator.sync", () => pass()),
      evaluator("dev.llm-core.evaluator.async", async () => pass(evidence[1])),
    ]);

    const pending = composition.evaluate(evaluationCase());
    expect(isPromiseLike(pending)).toBe(true);
    expect((await pending).map(({ evaluator: { evaluatorId } }) => String(evaluatorId))).toEqual([
      "dev.llm-core.evaluator.async",
      "dev.llm-core.evaluator.sync",
    ]);
  });

  test("rejects unrecorded or conflicting evidence and unknown criterion scores", () => {
    const unrecorded = evidenceRef("2203");
    expect(() =>
      createEvaluationComposition([
        evaluator("dev.llm-core.evaluator.unrecorded", () => pass(unrecorded)),
      ]).evaluate(evaluationCase()),
    ).toThrow("evidence-linked");

    const conflicting = {
      ...evidence[0]!,
      content: { ...evidence[0]!.content, byteLength: 999 },
    };
    expect(() =>
      createEvaluationComposition([
        evaluator("dev.llm-core.evaluator.conflict", () => pass(conflicting)),
      ]).evaluate(evaluationCase()),
    ).toThrow("evidence-linked");

    expect(() =>
      createEvaluationComposition([
        evaluator("dev.llm-core.evaluator.criterion", () => ({
          ...pass(),
          scores: [
            {
              criterionId: evaluationCriterionId("dev.llm-core.unknown"),
              value: 1,
            },
          ],
        })),
      ]).evaluate(evaluationCase()),
    ).toThrow("evidence-linked");
  });

  test("rejects duplicate evaluator versions but permits explicit version coexistence", () => {
    const first = evaluator("dev.llm-core.evaluator.versioned", () => pass());
    expect(() => createEvaluationComposition([first, first])).toThrow("unique");

    expect(
      createEvaluationComposition([
        first,
        evaluator("dev.llm-core.evaluator.versioned", () => pass(), "2.0.0"),
      ]).evaluators,
    ).toHaveLength(2);
  });

  test("fails closed on malformed case and judgement portable values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      createEvaluationCase({
        caseId: evaluationCaseId("dev.llm-core.case.cycle"),
        criteria: [
          {
            criterionId: correctness,
            description: "cycle",
            weight: cyclic as never,
          },
        ],
        evidence,
      }),
    ).toThrow("closed, portable");

    const sparse = new Array(1) as EvaluationCase["criteria"];
    expect(() =>
      createEvaluationCase({
        caseId: evaluationCaseId("dev.llm-core.case.sparse"),
        criteria: sparse,
        evidence,
      }),
    ).toThrow("closed, portable");

    expect(() =>
      createEvaluationComposition([
        evaluator("dev.llm-core.evaluator.nan", () => ({
          ...pass(),
          scores: [{ criterionId: correctness, value: Number.NaN }],
        })),
      ]).evaluate(evaluationCase()),
    ).toThrow("evidence-linked");

    expect(() =>
      createEvaluationComposition([
        evaluator("dev.llm-core.evaluator.unscored-pass", () => ({
          ...pass(),
          scores: [],
        })),
      ]).evaluate(evaluationCase()),
    ).toThrow("evidence-linked");
  });

  test("rejects explicitly undefined optional schema fields at every evidence boundary", () => {
    const undefinedSchema = {
      ...evidence[0]!,
      schema: undefined,
    } as unknown as EvidenceRef;

    expect(() =>
      createEvaluationCase({
        caseId: evaluationCaseId("dev.llm-core.case.undefined-schema"),
        criteria: [{ criterionId: correctness, description: "undefined", weight: 1 }],
        evidence: [undefinedSchema],
      }),
    ).toThrow("closed, portable");

    expect(() =>
      createEvaluationComposition([
        evaluator("dev.llm-core.evaluator.undefined-schema", () => pass(undefinedSchema)),
      ]).evaluate(evaluationCase()),
    ).toThrow("evidence-linked");
  });

  test("rejects hostile descriptors and evidence without invoking accessors", () => {
    let reads = 0;
    const descriptor = { version: contractVersion("1.0.0") } as Record<string, unknown>;
    Object.defineProperty(descriptor, "evaluatorId", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "dev.llm-core.evaluator.hostile";
      },
    });
    expect(() =>
      createEvaluationComposition([
        { descriptor, evaluate: () => pass() } as unknown as EvaluationEvaluator,
      ]),
    ).toThrow("descriptor-safe");
    expect(reads).toBe(0);

    const hidden = { ...evidence[0]!.content.digest };
    Object.defineProperty(hidden, "secret", { enumerable: false, value: "must-not-leak" });
    expect(() =>
      createEvaluationCase({
        caseId: evaluationCaseId("dev.llm-core.case.hidden"),
        criteria: [{ criterionId: correctness, description: "hidden", weight: 1 }],
        evidence: [{ ...evidence[0]!, content: { ...evidence[0]!.content, digest: hidden } }],
      }),
    ).toThrow("closed, portable");

    const symbolBearing = {
      ...evidence[0]!,
      [Symbol("native")]: "provider-handle",
    };
    expect(() =>
      createEvaluationCase({
        caseId: evaluationCaseId("dev.llm-core.case.symbol"),
        criteria: [{ criterionId: correctness, description: "symbol", weight: 1 }],
        evidence: [symbolBearing],
      }),
    ).toThrow("closed, portable");

    const nestedProxy = new Proxy(evidence[0]!.content, {
      ownKeys: () => {
        throw new Error("hostile proxy");
      },
    });
    expect(() =>
      createEvaluationCase({
        caseId: evaluationCaseId("dev.llm-core.case.proxy"),
        criteria: [{ criterionId: correctness, description: "proxy", weight: 1 }],
        evidence: [{ ...evidence[0]!, content: nestedProxy }],
      }),
    ).toThrow("closed, portable");

    const cyclicEvidence = { ...evidence[0]! } as Record<string, unknown>;
    cyclicEvidence.content = cyclicEvidence;
    expect(() =>
      createEvaluationCase({
        caseId: evaluationCaseId("dev.llm-core.case.cyclic-evidence"),
        criteria: [{ criterionId: correctness, description: "cycle", weight: 1 }],
        evidence: [cyclicEvidence as unknown as EvidenceRef],
      }),
    ).toThrow("closed, portable");
  });

  test("normalizes descriptor data without invoking proxy get traps", () => {
    let reads = 0;
    const descriptorOnly = <T extends object>(value: T): T =>
      new Proxy(value, {
        get: () => {
          reads += 1;
          throw new Error("ordinary property reads are forbidden");
        },
      });

    const proxyEvidence = descriptorOnly({
      ...evidence[0]!,
      content: descriptorOnly({
        ...evidence[0]!.content,
        digest: descriptorOnly({ ...evidence[0]!.content.digest }),
      }),
    });
    const proxyCase = descriptorOnly({
      caseId: evaluationCaseId("dev.llm-core.case.descriptor-snapshot"),
      criteria: descriptorOnly([
        descriptorOnly({
          criterionId: correctness,
          description: "Descriptor snapshot.",
          weight: 1,
        }),
      ]),
      evidence: descriptorOnly([proxyEvidence]),
    });
    const created = createEvaluationCase(proxyCase);

    const proxyJudgement = {
      status: "pass" as const,
      scores: descriptorOnly([
        descriptorOnly({
          criterionId: correctness,
          value: 1,
        }),
      ]),
      explanations: descriptorOnly(["Descriptor-safe."]),
      evidence: descriptorOnly([proxyEvidence]),
    };
    const proxyEvaluator = descriptorOnly({
      descriptor: descriptorOnly({
        evaluatorId: evaluationEvaluatorId("dev.llm-core.evaluator.descriptor-snapshot"),
        version: contractVersion("1.0.0"),
      }),
      evaluate: () => proxyJudgement,
    });
    const result = createEvaluationComposition([proxyEvaluator]).evaluate(created);

    expect(isPromiseLike(result)).toBe(false);
    expect(result).toMatchObject([{ status: "pass" }]);
    expect(reads).toBe(0);
  });
});
