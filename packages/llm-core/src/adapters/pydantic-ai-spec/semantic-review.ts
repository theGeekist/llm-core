import {
  issue,
  pydanticDiagnostics,
  semanticCategoryIds as SEMANTIC_CATEGORIES,
  semanticIssue,
  modelRequirementDiagnostic,
  type SemanticCategory,
  type PydanticDiagnosticDefinition,
} from "./native-contract";
import { isJsonValue, type JsonValue } from "#contracts";
import { compareUtf16CodeUnits } from "#shared/fp";
import type {
  SpecificationDiagnostic,
  SpecificationProjectionView,
} from "@geekist/llm-core/specifications";
import type { PydanticAiCompilationTarget } from "./types";

type ReviewedSemanticValues = Pick<PydanticAiCompilationTarget["semantics"], SemanticCategory>;
interface AcceptedSemanticProjection {
  readonly values: ReviewedSemanticValues;
  readonly nodeIds: Readonly<Partial<Record<SemanticCategory, SpecificationDiagnostic["nodeId"]>>>;
  readonly invalid: ReadonlySet<SemanticCategory>;
  readonly issues: readonly SpecificationDiagnostic[];
}

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
        semanticIssue(
          category,
          "acceptedContentMissing",
          missing?.scopeId ?? projection.acceptedItems[0]!.scopeId,
        ),
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
      issues.push(semanticIssue(category, "contentInvalid", first.nodeId));
      continue;
    }
    const contradiction = categoryObservations.find(
      (observation) => !samePortableValue(observation.value, first.value),
    );
    if (contradiction !== undefined) {
      invalid.add(category);
      issues.push(semanticIssue(category, "acceptedContentContradictory", contradiction.nodeId));
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
    return [semanticIssue(category, "reviewScopeInvalid", nodeId)];
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
    return [semanticIssue(category, "reviewContentMismatch", accepted.nodeIds[category] ?? nodeId)];
  });

const modelRequirementIssues = (
  semantics: PydanticAiCompilationTarget["semantics"],
  accepted: AcceptedSemanticProjection,
  nodeId: SpecificationDiagnostic["nodeId"],
): readonly SpecificationDiagnostic[] => {
  if (!Array.isArray(semantics.modelRequirements)) {
    return [
      issue({
        ...pydanticDiagnostics.modelRequirementsInvalid,
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
  return [modelRequirementDiagnostic(required, nodeId)];
};

const promptIssues = (
  accepted: AcceptedSemanticProjection,
  nodeId: SpecificationDiagnostic["nodeId"],
): readonly SpecificationDiagnostic[] =>
  !accepted.invalid.has("prompt") && accepted.values.prompt !== null
    ? [
        issue({
          ...pydanticDiagnostics.promptTemplateUnsupported,
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
        ...pydanticDiagnostics.toolsInvalid,
        nodeId,
      }),
    ];
  }
  return !accepted.invalid.has("tools") &&
    Array.isArray(accepted.values.tools) &&
    accepted.values.tools.length > 0
    ? [
        issue({
          ...pydanticDiagnostics.toolDeclarationsUnsupported,
          nodeId,
        }),
      ]
    : [];
};

const nullableCategoryIssues = (input: {
  readonly accepted: AcceptedSemanticProjection;
  readonly category: "context" | "evaluation";
  readonly diagnostic: PydanticDiagnosticDefinition;
  readonly nodeId: SpecificationDiagnostic["nodeId"];
}): readonly SpecificationDiagnostic[] =>
  !input.accepted.invalid.has(input.category) && input.accepted.values[input.category] !== null
    ? [
        issue({
          ...input.diagnostic,
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
        ...pydanticDiagnostics.semanticReviewRequired,
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
      diagnostic: pydanticDiagnostics.contextSelectionUnsupported,
      nodeId,
    }),
    ...nullableCategoryIssues({
      accepted,
      category: "evaluation",
      diagnostic: pydanticDiagnostics.evaluationQualificationUnsupported,
      nodeId,
    }),
  ];
};
