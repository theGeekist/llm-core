import {
  createEvaluationCase,
  createEvaluationComposition,
  evaluationCaseId,
  evaluationCriterionId,
  evaluationEvaluatorId,
} from "@geekist/llm-core/evaluation";
import {
  contractVersion,
  digest,
  newCoreId,
  type EvidenceId,
  type ResourceId,
} from "@geekist/llm-core/contracts";

const correctness = evaluationCriterionId("example.correctness");
const evidence = {
  evidenceId: newCoreId<EvidenceId>("0190bd0c-0000-7000-8000-000000002440"),
  kind: "evaluation" as const,
  content: {
    resourceId: newCoreId<ResourceId>("0190bd0c-0000-7000-8000-000000002441"),
    mediaType: "application/json",
    byteLength: 42,
    digest: digest("c".repeat(64)),
  },
};

const evaluationCase = createEvaluationCase({
  caseId: evaluationCaseId("example.case.answer"),
  criteria: [{ criterionId: correctness, description: "The answer is correct.", weight: 1 }],
  evidence: [evidence],
});

const evaluation = createEvaluationComposition([
  {
    descriptor: {
      evaluatorId: evaluationEvaluatorId("example.evaluator.exact"),
      version: contractVersion("1.0.0"),
    },
    evaluate: () => ({
      status: "pass",
      scores: [{ criterionId: correctness, value: 1 }],
      explanations: ["The recorded answer matches the expected value."],
      evidence: [evidence],
    }),
  },
]);

const results = await evaluation.evaluate(evaluationCase);
void results;
