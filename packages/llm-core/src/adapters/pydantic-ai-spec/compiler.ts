import {
  contractVersion,
  digest,
  extensionNamespace,
  isJsonValue,
  type JsonValue,
} from "#contracts";
import { compareUtf16CodeUnits } from "#shared/fp";
import { maybeMap, type MaybePromise } from "#shared/maybe";
import type {
  CompiledSpecification,
  SpecificationAdapterSupport,
  SpecificationDecision,
  SpecificationDiagnostic,
  SpecificationOperation,
  SpecificationProjectionView,
} from "@aifsd/llm-core/specifications";
import {
  createSpecificationAdapterSupport,
  createSpecificationOperation,
  projectSpecification,
} from "@aifsd/llm-core/specifications";
import type {
  PydanticAgentDefinition,
  PydanticAiCompilation,
  PydanticAiCompilationTarget,
  PydanticAiRetryBudget,
  PydanticAiSafeCapability,
} from "./types";
import { PydanticAiUnsupportedSemanticsError } from "./types";

/* eslint-disable max-lines -- the closed projection matrix and support evidence remain reviewable together */

export const PYDANTIC_AI_AGENT_SPEC_VERSION = "2.19.0" as const;

const issue = (input: {
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

const SAFE_CAPABILITIES = new Set<PydanticAiSafeCapability>([
  "IncludeToolReturnSchemas",
  "RaiseContentFilterError",
  "ReinjectSystemPrompt",
]);

const EFFECTFUL_CAPABILITIES = new Set([
  "ImageGeneration",
  "Instrumentation",
  "MCP",
  "NativeTool",
  "ToolSearch",
  "Toolset",
  "WebFetch",
  "WebSearch",
  "XSearch",
]);

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

// eslint-disable-next-line sonarjs/cognitive-complexity -- each closed category is validated fail-closed in one authority-bound pass
const semanticContent = (projection: SpecificationProjectionView): AcceptedSemanticProjection => {
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
    const arrayCategory = category === "modelRequirements" || category === "tools";
    const invalidArray =
      arrayCategory &&
      (!Array.isArray(first.value) ||
        (category === "modelRequirements" && !first.value.every(isReviewedRequirement)) ||
        (category === "tools" && !first.value.every(isReviewedTool)));
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
  const acceptedScopeSet = new Set(acceptedScope);
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

const capabilityIssues = (
  capabilities: unknown,
  nodeId: SpecificationDiagnostic["nodeId"],
): readonly SpecificationDiagnostic[] => {
  if (capabilities === undefined) return [];
  if (!Array.isArray(capabilities)) {
    return [
      issue({
        code: "pydantic-ai.capabilities-invalid",
        impact: "blocking",
        explanation: "AgentSpec capabilities must use the qualified 2.19.0 safe subset.",
        nodeId,
      }),
    ];
  }
  return capabilities.flatMap((capability) => {
    if (typeof capability === "string" && SAFE_CAPABILITIES.has(capability as never)) return [];
    const name =
      typeof capability === "string"
        ? capability
        : capability !== null && typeof capability === "object" && !Array.isArray(capability)
          ? Object.keys(capability)[0]
          : undefined;
    const effectful = name !== undefined && EFFECTFUL_CAPABILITIES.has(name);
    return [
      issue({
        code: effectful
          ? "pydantic-ai.effectful-capability-unsupported"
          : "pydantic-ai.unknown-capability-unsupported",
        impact: "blocking",
        explanation: effectful
          ? `PydanticAI capability ${name} may introduce native tools, network access, or other effects outside llm-core control.`
          : "The capability is outside the closed PydanticAI 2.19.0 safe subset.",
        nodeId,
      }),
    ];
  });
};

const hasExplicitSemanticReview = (
  semantics: PydanticAiCompilationTarget["semantics"],
): boolean => {
  if (typeof semantics !== "object" || semantics === null) return false;
  const requiredKeys = [...SEMANTIC_CATEGORIES, "reviewedScope"] as const;
  if (!requiredKeys.every((key) => Object.hasOwn(semantics, key))) return false;
  return typeof semantics.reviewedScope === "object" && semantics.reviewedScope !== null;
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
    (requirement) => requirement.required !== false,
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

const reviewedSemanticIssues = (
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

const operationFor = (
  target: PydanticAiCompilationTarget,
  projection: SpecificationProjectionView,
  nodeId: SpecificationDiagnostic["nodeId"],
): SpecificationOperation => {
  const diagnostics: SpecificationDiagnostic[] = [
    ...reviewedSemanticIssues(target.semantics, projection, nodeId),
  ];
  if (target.agent.effectRequirement !== "read-only") {
    diagnostics.push(
      issue({
        code: "pydantic-ai.controlled-effects-unsupported",
        impact: "blocking",
        explanation:
          "PydanticAI deferred calls are not llm-core controlled-effect authority or receipts.",
        nodeId,
      }),
    );
  }
  if (target.agent.skills?.length) {
    diagnostics.push(
      issue({
        code: "pydantic-ai.agent-skills-unsupported",
        impact: "blocking",
        explanation: "Requested llm-core skill references have no exact AgentSpec representation.",
        nodeId,
      }),
    );
  }
  if (target.depsSchema !== undefined) {
    diagnostics.push(
      issue({
        code: "pydantic-ai.deps-schema-unsupported",
        impact: "blocking",
        explanation:
          "Requested depsSchema runtime dependency semantics are not preserved by AgentSpec deps_schema template validation.",
        nodeId,
      }),
    );
  }
  if (target.outputSchema !== undefined) {
    diagnostics.push(
      issue({
        code: "pydantic-ai.output-schema-unsupported",
        impact: "blocking",
        explanation:
          "Requested outputSchema validation semantics are not preserved by AgentSpec output_schema instructions.",
        nodeId,
      }),
    );
  }
  diagnostics.push(...capabilityIssues(target.capabilities, nodeId));
  const sourceContract = {
    authority: "PydanticAI AgentSpec",
    format: {
      id: extensionNamespace("ai.pydantic.agentspec"),
      version: contractVersion(PYDANTIC_AI_AGENT_SPEC_VERSION),
    },
    revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
  } as const;
  return diagnostics.some(({ impact }) => impact === "blocking")
    ? createSpecificationOperation({
        operation: "compile-portable-specification",
        sourceContract,
        disposition: "unsupported",
        reason: "The requested portable semantics do not have an exact AgentSpec representation.",
        diagnostics,
      })
    : createSpecificationOperation({
        operation: "compile-portable-specification",
        sourceContract,
        disposition: "supported",
        fixtures: [
          {
            fixtureId: "pydantic-ai-agentspec-v2.19.0",
            digest: digest("a4e6a0d071ca2779e2aae4fe309cc8a7952a890f1ad12bbcef0bc00a632dd0fc"),
          },
          {
            fixtureId: "pydantic-ai-agentspec-validator-v2.19.0",
            digest: digest("1546f39b6369e0689a097383908a444ad1e489924d94e98fcce65379afb3df4f"),
          },
        ],
        diagnostics,
      });
};

const project = (target: PydanticAiCompilationTarget): PydanticAgentDefinition => ({
  model: target.model,
  name: target.agent.agentId,
  instructions: target.agent.instructions,
  ...(target.description === undefined ? {} : { description: target.description }),
  ...(target.depsSchema === undefined ? {} : { deps_schema: target.depsSchema }),
  ...(target.outputSchema === undefined ? {} : { output_schema: target.outputSchema }),
  ...(target.modelSettings === undefined ? {} : { model_settings: target.modelSettings }),
  ...(target.retries === undefined ? {} : { retries: target.retries }),
  ...(target.endStrategy === undefined ? {} : { end_strategy: target.endStrategy }),
  ...(target.toolTimeout === undefined ? {} : { tool_timeout: target.toolTimeout }),
  ...(target.agent.metadata === undefined ? {} : { metadata: target.agent.metadata }),
  ...(target.capabilities === undefined ? {} : { capabilities: target.capabilities }),
});

const assertRetries = (retries: PydanticAiRetryBudget | undefined): void => {
  if (retries === undefined) return;
  if (
    typeof retries !== "object" ||
    retries === null ||
    Array.isArray(retries) ||
    Object.keys(retries).length !== 2 ||
    !("tools" in retries) ||
    !("output" in retries) ||
    !Number.isInteger(retries.tools) ||
    retries.tools < 0 ||
    !Number.isInteger(retries.output) ||
    retries.output < 0
  ) {
    throw new TypeError(
      "PydanticAI AgentSpec retries must be exactly { tools, output } with nonnegative integers.",
    );
  }
};

export const PYDANTIC_AI_AGENT_SPEC_SUPPORT: SpecificationAdapterSupport =
  createSpecificationAdapterSupport({
    format: {
      id: extensionNamespace("ai.pydantic.agentspec"),
      version: contractVersion(PYDANTIC_AI_AGENT_SPEC_VERSION),
    },
    authority: "PydanticAI AgentSpec",
    revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
    sourceOwnership: "source-owned",
    operations: [
      createSpecificationOperation({
        operation: "observe-native-source",
        sourceContract: {
          authority: "PydanticAI AgentSpec",
          format: {
            id: extensionNamespace("ai.pydantic.agentspec"),
            version: contractVersion(PYDANTIC_AI_AGENT_SPEC_VERSION),
          },
          revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
        },
        disposition: "unsupported",
        reason: "PydanticAI AgentSpec native observation is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "derive-portable-specification",
        sourceContract: {
          authority: "PydanticAI AgentSpec",
          format: {
            id: extensionNamespace("ai.pydantic.agentspec"),
            version: contractVersion(PYDANTIC_AI_AGENT_SPEC_VERSION),
          },
          revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
        },
        disposition: "unsupported",
        reason: "PydanticAI AgentSpec portable derivation is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "compile-portable-specification",
        sourceContract: {
          authority: "PydanticAI AgentSpec",
          format: {
            id: extensionNamespace("ai.pydantic.agentspec"),
            version: contractVersion(PYDANTIC_AI_AGENT_SPEC_VERSION),
          },
          revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
        },
        disposition: "supported",
        fixtures: [
          {
            fixtureId: "pydantic-ai-agentspec-v2.19.0",
            digest: digest("a4e6a0d071ca2779e2aae4fe309cc8a7952a890f1ad12bbcef0bc00a632dd0fc"),
          },
          {
            fixtureId: "pydantic-ai-agentspec-validator-v2.19.0",
            digest: digest("1546f39b6369e0689a097383908a444ad1e489924d94e98fcce65379afb3df4f"),
          },
        ],
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "export-native-source",
        sourceContract: {
          authority: "PydanticAI AgentSpec",
          format: {
            id: extensionNamespace("ai.pydantic.agentspec"),
            version: contractVersion(PYDANTIC_AI_AGENT_SPEC_VERSION),
          },
          revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
        },
        disposition: "unsupported",
        reason: "PydanticAI AgentSpec native export is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "round-trip-native-source",
        sourceContract: {
          authority: "PydanticAI AgentSpec",
          format: {
            id: extensionNamespace("ai.pydantic.agentspec"),
            version: contractVersion(PYDANTIC_AI_AGENT_SPEC_VERSION),
          },
          revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
        },
        disposition: "unsupported",
        reason: "PydanticAI AgentSpec round trip is not implemented.",
        diagnostics: [],
      }),
    ],
  });

/**
 * Compiles through the public, review-bound specification facade. The facade
 * owns accepted-handle provenance and use-time authority checks.
 */
export const compilePydanticAiAgentSpec = (input: {
  readonly decision: SpecificationDecision;
  readonly target: PydanticAiCompilationTarget;
}): MaybePromise<PydanticAiCompilation> => {
  if (input.decision.status !== "accepted") {
    throw new TypeError(
      "PydanticAI AgentSpec compilation requires an accepted specification decision.",
    );
  }
  const decision = input.decision;
  return maybeMap(
    ({
      compiled,
      result,
    }: {
      readonly compiled: CompiledSpecification<PydanticAgentDefinition>;
      readonly result: SpecificationOperation;
    }) => ({ compiled, operation: result }),
    projectSpecification(decision, {
      project: (projection) => {
        const nodeId = decision.record.acceptedScope[0];
        if (nodeId === undefined) {
          throw new TypeError(
            "PydanticAI AgentSpec compilation requires a non-empty accepted scope.",
          );
        }
        const operation = operationFor(input.target, projection, nodeId);
        if (!input.target.model.trim()) {
          throw new TypeError("PydanticAI AgentSpec compilation requires a model identifier.");
        }
        assertRetries(input.target.retries);
        if (operation.disposition === "unsupported") {
          throw new PydanticAiUnsupportedSemanticsError(operation);
        }
        if (
          input.target.toolTimeout !== undefined &&
          (!Number.isFinite(input.target.toolTimeout) || input.target.toolTimeout <= 0)
        ) {
          throw new TypeError("PydanticAI AgentSpec toolTimeout must be a positive finite number.");
        }
        return { target: project(input.target), result: operation };
      },
    }),
  );
};
