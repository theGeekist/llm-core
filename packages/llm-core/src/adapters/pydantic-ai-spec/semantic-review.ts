import { isJsonValue, type JsonValue } from "#contracts";
import { compareUtf16CodeUnits } from "#shared/fp";
import type {
  SpecificationDiagnostic,
  SpecificationProjectionView,
} from "@geekist/llm-core/specifications";
import type { PydanticAiCompilationTarget } from "./types";

export const issue = (input: {
  readonly code: string;
  readonly impact: SpecificationDiagnostic["impact"];
  readonly explanation: string;
  readonly nodeId: SpecificationDiagnostic["nodeId"];
}): SpecificationDiagnostic => ({
  code: input.code,
  severity: input.impact === "blocking" ? "error" : "warning",
  impact: input.impact,
  explanation: input.explanation,
  nodeId: input.nodeId,
});

const SEMANTIC_CATEGORIES = [
  "modelRequirements",
  "prompt",
  "tools",
  "context",
  "evaluation",
] as const;

type SemanticCategory = (typeof SEMANTIC_CATEGORIES)[number];

type ReviewedSemanticValues = Pick<PydanticAiCompilationTarget["semantics"], SemanticCategory>;

interface AcceptedSemanticProjection {
  readonly values: ReviewedSemanticValues;
  readonly nodeIds: Readonly<Partial<Record<SemanticCategory, SpecificationDiagnostic["nodeId"]>>>;
  readonly invalid: ReadonlySet<SemanticCategory>;
  readonly issues: readonly SpecificationDiagnostic[];
}

const categoryCode = (category: SemanticCategory): string =>
  category === "modelRequirements" ? "model-requirements" : category;

const canonicalJson = (value: JsonValue): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort(compareUtf16CodeUnits)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(",")}}`;
};

const samePortableValue = (left: unknown, right: unknown): boolean =>
  isJsonValue(left) && isJsonValue(right) && canonicalJson(left) === canonicalJson(right);

const isReviewedRequirement = (value: unknown): boolean =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as { readonly capabilityId?: unknown }).capabilityId === "string" &&
  ((value as { readonly required?: unknown }).required === undefined ||
    typeof (value as { readonly required?: unknown }).required === "boolean");

const isReviewedTool = (value: unknown): boolean =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as { readonly name?: unknown }).name === "string";

const semanticObservations = (projection: SpecificationProjectionView) => {
  const observations = new Map<
    SemanticCategory,
    { readonly nodeId: SpecificationDiagnostic["nodeId"]; readonly value: JsonValue }[]
  >();
  for (const item of projection.acceptedItems) {
    if (item.content === null || typeof item.content !== "object" || Array.isArray(item.content)) {
      continue;
    }
    for (const category of SEMANTIC_CATEGORIES) {
      if (!Object.hasOwn(item.content, category)) continue;
      const values = observations.get(category) ?? [];
      values.push({ nodeId: item.scopeId, value: item.content[category]! });
      observations.set(category, values);
    }
  }

  return observations;
};

const invalidCategoryArray = (category: SemanticCategory, value: unknown): boolean => {
  const arrayCategory = category === "modelRequirements" || category === "tools";
  return (
    arrayCategory &&
    (!Array.isArray(value) ||
      (category === "modelRequirements" && !value.every(isReviewedRequirement)) ||
      (category === "tools" && !value.every(isReviewedTool)))
  );
};

const semanticContent = (projection: SpecificationProjectionView): AcceptedSemanticProjection => {
  const observations = semanticObservations(projection);

  const issues: SpecificationDiagnostic[] = [];
  const invalid = new Set<SemanticCategory>();
  const nodeIds: Partial<Record<SemanticCategory, SpecificationDiagnostic["nodeId"]>> = {};
  const values: Record<SemanticCategory, unknown> = {
    modelRequirements: [],
    prompt: null,
    tools: [],
    context: null,
    evaluation: null,
  };
  for (const category of SEMANTIC_CATEGORIES) {
    const categoryObservations = observations.get(category) ?? [];
    if (categoryObservations.length !== projection.acceptedItems.length) {
      const missing = projection.acceptedItems.find(
        (item) =>
          item.content === null ||
          typeof item.content !== "object" ||
          Array.isArray(item.content) ||
          !Object.hasOwn(item.content, category),
      );
      invalid.add(category);
      issues.push(
        issue({
          code: `pydantic-ai.${categoryCode(category)}-accepted-content-missing`,
          impact: "blocking",
          explanation: `Every accepted item must explicitly bind ${category} content; an omitted field is not evidence of semantic absence.`,
          nodeId: missing?.scopeId ?? projection.acceptedItems[0]!.scopeId,
        }),
      );
      continue;
    }
    const first = categoryObservations[0];
    if (first === undefined) continue;
    nodeIds[category] = first.nodeId;
    values[category] = first.value;
    const invalidArray = invalidCategoryArray(category, first.value);
    if (invalidArray) {
      invalid.add(category);
      issues.push(
        issue({
          code: `pydantic-ai.${categoryCode(category)}-content-invalid`,
          impact: "blocking",
          explanation: `Accepted ${category} content must be an explicit array of portable category values.`,
          nodeId: first.nodeId,
        }),
      );
      continue;
    }
    const contradiction = categoryObservations.find(
      (observation) => !samePortableValue(observation.value, first.value),
    );
    if (contradiction !== undefined) {
      invalid.add(category);
      issues.push(
        issue({
          code: `pydantic-ai.${categoryCode(category)}-accepted-content-contradictory`,
          impact: "blocking",
          explanation: `Accepted ${category} content contains conflicting values, including explicit empty or null claims.`,
          nodeId: contradiction.nodeId,
        }),
      );
    }
  }
  return {
    values: values as ReviewedSemanticValues,
    nodeIds,
    invalid,
    issues: issues.length === 0 ? [] : issues,
  };
};

const reviewedScopeIssues = (
  semantics: PydanticAiCompilationTarget["semantics"],
  projection: SpecificationProjectionView,
  nodeId: SpecificationDiagnostic["nodeId"],
): readonly SpecificationDiagnostic[] => {
  const acceptedScope = projection.acceptedItems.map((item) => item.scopeId);
  const acceptedScopeSet: ReadonlySet<unknown> = new Set(acceptedScope);
  return SEMANTIC_CATEGORIES.flatMap((category) => {
    const reviewedScope = semantics.reviewedScope[category];
    const exactCoverage =
      Array.isArray(reviewedScope) &&
      reviewedScope.length === acceptedScope.length &&
      new Set(reviewedScope).size === acceptedScope.length &&
      reviewedScope.every((scopeId) => acceptedScopeSet.has(scopeId));
    if (exactCoverage) return [];
    return [
      issue({
        code: `pydantic-ai.${
          category === "modelRequirements" ? "model-requirements" : category
        }-review-scope-invalid`,
        impact: "blocking",
        explanation: `Reviewed ${category} semantics must account for every item in the accepted specification scope.`,
        nodeId,
      }),
    ];
  });
};

const hasExplicitSemanticReview = (semantics: unknown): boolean => {
  if (typeof semantics !== "object" || semantics === null) return false;
  const requiredKeys = [...SEMANTIC_CATEGORIES, "reviewedScope"] as const;
  if (!requiredKeys.every((key) => Object.hasOwn(semantics, key))) return false;
  return (
    typeof (semantics as { readonly reviewedScope: unknown }).reviewedScope === "object" &&
    (semantics as { readonly reviewedScope: unknown }).reviewedScope !== null
  );
};

const semanticMismatchIssues = (
  semantics: PydanticAiCompilationTarget["semantics"],
  accepted: AcceptedSemanticProjection,
  nodeId: SpecificationDiagnostic["nodeId"],
): readonly SpecificationDiagnostic[] =>
  SEMANTIC_CATEGORIES.flatMap((category) => {
    if (
      accepted.invalid.has(category) ||
      samePortableValue(semantics[category], accepted.values[category])
    ) {
      return [];
    }
    return [
      issue({
        code: `pydantic-ai.${categoryCode(category)}-review-content-mismatch`,
        impact: "blocking",
        explanation: `Reviewed ${category} semantics must exactly match the authority-bound accepted item content.`,
        nodeId: accepted.nodeIds[category] ?? nodeId,
      }),
    ];
  });

const modelRequirementIssues = (
  semantics: PydanticAiCompilationTarget["semantics"],
  accepted: AcceptedSemanticProjection,
  nodeId: SpecificationDiagnostic["nodeId"],
): readonly SpecificationDiagnostic[] => {
  if (!Array.isArray(semantics.modelRequirements)) {
    return [
      issue({
        code: "pydantic-ai.model-requirements-invalid",
        impact: "blocking",
        explanation: "Reviewed model requirements must be an explicit array.",
        nodeId,
      }),
    ];
  }
  if (
    accepted.invalid.has("modelRequirements") ||
    !Array.isArray(accepted.values.modelRequirements) ||
    accepted.values.modelRequirements.length === 0
  ) {
    return [];
  }
  const required = accepted.values.modelRequirements.some(
    (requirement: { readonly required?: boolean }) => requirement.required !== false,
  );
  return [
    issue({
      code: "pydantic-ai.model-requirements-unsupported",
      impact: "blocking",
      explanation: `${required ? "Required" : "Advisory"} llm-core model requirements and their resolution authority have no exact AgentSpec representation.`,
      nodeId,
    }),
  ];
};

const promptIssues = (
  accepted: AcceptedSemanticProjection,
  nodeId: SpecificationDiagnostic["nodeId"],
): readonly SpecificationDiagnostic[] =>
  !accepted.invalid.has("prompt") && accepted.values.prompt !== null
    ? [
        issue({
          code: "pydantic-ai.prompt-template-unsupported",
          impact: "blocking",
          explanation:
            "AgentSpec instructions do not preserve llm-core prompt template identity, inputs, schema, and metadata semantics.",
          nodeId,
        }),
      ]
    : [];

const toolIssues = (
  semantics: PydanticAiCompilationTarget["semantics"],
  accepted: AcceptedSemanticProjection,
  nodeId: SpecificationDiagnostic["nodeId"],
): readonly SpecificationDiagnostic[] => {
  if (!Array.isArray(semantics.tools)) {
    return [
      issue({
        code: "pydantic-ai.tools-invalid",
        impact: "blocking",
        explanation: "Reviewed tool semantics must be an explicit array.",
        nodeId,
      }),
    ];
  }
  return !accepted.invalid.has("tools") &&
    Array.isArray(accepted.values.tools) &&
    accepted.values.tools.length > 0
    ? [
        issue({
          code: "pydantic-ai.tool-declarations-unsupported",
          impact: "blocking",
          explanation:
            "AgentSpec cannot retain llm-core tool declaration, control, and execution authority semantics.",
          nodeId,
        }),
      ]
    : [];
};

const nullableCategoryIssues = (input: {
  readonly accepted: AcceptedSemanticProjection;
  readonly category: "context" | "evaluation";
  readonly code: string;
  readonly explanation: string;
  readonly nodeId: SpecificationDiagnostic["nodeId"];
}): readonly SpecificationDiagnostic[] =>
  !input.accepted.invalid.has(input.category) && input.accepted.values[input.category] !== null
    ? [
        issue({
          code: input.code,
          impact: "blocking",
          explanation: input.explanation,
          nodeId: input.nodeId,
        }),
      ]
    : [];

export const reviewedSemanticIssues = (
  semantics: PydanticAiCompilationTarget["semantics"],
  projection: SpecificationProjectionView,
  nodeId: SpecificationDiagnostic["nodeId"],
): readonly SpecificationDiagnostic[] => {
  if (!hasExplicitSemanticReview(semantics)) {
    return [
      issue({
        code: "pydantic-ai.semantic-review-required",
        impact: "blocking",
        explanation:
          "Projection requires explicit review accounting for model requirement, prompt, tool, context, and evaluation semantics.",
        nodeId,
      }),
    ];
  }
  const accepted = semanticContent(projection);
  return [
    ...reviewedScopeIssues(semantics, projection, nodeId),
    ...accepted.issues,
    ...semanticMismatchIssues(semantics, accepted, nodeId),
    ...modelRequirementIssues(semantics, accepted, nodeId),
    ...promptIssues(accepted, nodeId),
    ...toolIssues(semantics, accepted, nodeId),
    ...nullableCategoryIssues({
      accepted,
      category: "context",
      code: "pydantic-ai.context-selection-unsupported",
      explanation:
        "AgentSpec cannot retain llm-core context scope, provenance, eligibility, and budget semantics.",
      nodeId,
    }),
    ...nullableCategoryIssues({
      accepted,
      category: "evaluation",
      code: "pydantic-ai.evaluation-qualification-unsupported",
      explanation:
        "AgentSpec cannot retain llm-core evaluation qualification, evidence, and promotion-gate semantics.",
      nodeId,
    }),
  ];
};
