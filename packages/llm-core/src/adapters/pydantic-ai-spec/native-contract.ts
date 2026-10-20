import { contractVersion, digest, extensionNamespace } from "#contracts";
import { cloneFrozen } from "#shared/portable-data";
import type { SpecificationDiagnostic } from "@geekist/llm-core/specifications";
import type { PydanticAiSafeCapability } from "./types";

const agentSpecVersion = "2.19.0";

/** Exact upstream AgentSpec authority and two independently hashed qualification fixtures. */
export const pydanticAgentSpec = cloneFrozen({
  version: agentSpecVersion,
  source: {
    authority: "PydanticAI AgentSpec",
    format: {
      id: extensionNamespace("ai.pydantic.agentspec"),
      version: contractVersion(agentSpecVersion),
    },
    revision: "ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5",
  },
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
} as const);

/** Each stable machine code is inseparable from its impact and explanatory meaning. */
export const pydanticDiagnostics = cloneFrozen({
  capabilitiesInvalid: {
    code: "pydantic-ai.capabilities-invalid",
    impact: "blocking",
    explanation: "AgentSpec capabilities must use the qualified 2.19.0 safe subset.",
  },
  controlledEffectsUnsupported: {
    code: "pydantic-ai.controlled-effects-unsupported",
    impact: "blocking",
    explanation:
      "PydanticAI deferred calls are not llm-core controlled-effect authority or receipts.",
  },
  agentSkillsUnsupported: {
    code: "pydantic-ai.agent-skills-unsupported",
    impact: "blocking",
    explanation: "Requested llm-core skill references have no exact AgentSpec representation.",
  },
  depsSchemaUnsupported: {
    code: "pydantic-ai.deps-schema-unsupported",
    impact: "blocking",
    explanation:
      "Requested depsSchema runtime dependency semantics are not preserved by AgentSpec deps_schema template validation.",
  },
  outputSchemaUnsupported: {
    code: "pydantic-ai.output-schema-unsupported",
    impact: "blocking",
    explanation:
      "Requested outputSchema validation semantics are not preserved by AgentSpec output_schema instructions.",
  },
  modelRequirementsInvalid: {
    code: "pydantic-ai.model-requirements-invalid",
    impact: "blocking",
    explanation: "Reviewed model requirements must be an explicit array.",
  },
  promptTemplateUnsupported: {
    code: "pydantic-ai.prompt-template-unsupported",
    impact: "blocking",
    explanation:
      "AgentSpec instructions do not preserve llm-core prompt template identity, inputs, schema, and metadata semantics.",
  },
  toolsInvalid: {
    code: "pydantic-ai.tools-invalid",
    impact: "blocking",
    explanation: "Reviewed tool semantics must be an explicit array.",
  },
  toolDeclarationsUnsupported: {
    code: "pydantic-ai.tool-declarations-unsupported",
    impact: "blocking",
    explanation:
      "AgentSpec cannot retain llm-core tool declaration, control, and execution authority semantics.",
  },
  semanticReviewRequired: {
    code: "pydantic-ai.semantic-review-required",
    impact: "blocking",
    explanation:
      "Projection requires explicit review accounting for model requirement, prompt, tool, context, and evaluation semantics.",
  },
  contextSelectionUnsupported: {
    code: "pydantic-ai.context-selection-unsupported",
    impact: "blocking",
    explanation:
      "AgentSpec cannot retain llm-core context scope, provenance, eligibility, and budget semantics.",
  },
  evaluationQualificationUnsupported: {
    code: "pydantic-ai.evaluation-qualification-unsupported",
    impact: "blocking",
    explanation:
      "AgentSpec cannot retain llm-core evaluation qualification, evidence, and promotion-gate semantics.",
  },
} as const);
export type PydanticDiagnosticDefinition =
  (typeof pydanticDiagnostics)[keyof typeof pydanticDiagnostics];

const semanticCategoryDefinitions = [
  { id: "modelRequirements", code: "model-requirements" },
  { id: "prompt", code: "prompt" },
  { id: "tools", code: "tools" },
  { id: "context", code: "context" },
  { id: "evaluation", code: "evaluation" },
] as const;
export type SemanticCategory = (typeof semanticCategoryDefinitions)[number]["id"];
export const semanticCategoryIds = Object.freeze(semanticCategoryDefinitions.map(({ id }) => id));
const categoryCode = (category: SemanticCategory) =>
  semanticCategoryDefinitions.find(({ id }) => id === category)!.code;
const semanticFailures = {
  acceptedContentMissing: {
    suffix: "accepted-content-missing",
    explanation: (category: SemanticCategory) =>
      `Every accepted item must explicitly bind ${category} content; an omitted field is not evidence of semantic absence.`,
  },
  contentInvalid: {
    suffix: "content-invalid",
    explanation: (category: SemanticCategory) =>
      `Accepted ${category} content must be an explicit array of portable category values.`,
  },
  acceptedContentContradictory: {
    suffix: "accepted-content-contradictory",
    explanation: (category: SemanticCategory) =>
      `Accepted ${category} content contains conflicting values, including explicit empty or null claims.`,
  },
  reviewScopeInvalid: {
    suffix: "review-scope-invalid",
    explanation: (category: SemanticCategory) =>
      `Reviewed ${category} semantics must account for every item in the accepted specification scope.`,
  },
  reviewContentMismatch: {
    suffix: "review-content-mismatch",
    explanation: (category: SemanticCategory) =>
      `Reviewed ${category} semantics must exactly match the authority-bound accepted item content.`,
  },
} as const;
type SemanticFailure = keyof typeof semanticFailures;
type DiagnosticCode =
  | PydanticDiagnosticDefinition["code"]
  | `pydantic-ai.${(typeof semanticCategoryDefinitions)[number]["code"]}-${(typeof semanticFailures)[SemanticFailure]["suffix"]}`
  | "pydantic-ai.model-requirements-unsupported"
  | "pydantic-ai.effectful-capability-unsupported"
  | "pydantic-ai.unknown-capability-unsupported";

export const issue = (input: {
  readonly code: DiagnosticCode;
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

export const semanticIssue = (
  category: SemanticCategory,
  failure: SemanticFailure,
  nodeId: SpecificationDiagnostic["nodeId"],
): SpecificationDiagnostic => {
  const definition = semanticFailures[failure];
  return issue({
    code: `pydantic-ai.${categoryCode(category)}-${definition.suffix}`,
    impact: "blocking",
    explanation: definition.explanation(category),
    nodeId,
  });
};

export const modelRequirementDiagnostic = (
  required: boolean,
  nodeId: SpecificationDiagnostic["nodeId"],
): SpecificationDiagnostic =>
  issue({
    code: "pydantic-ai.model-requirements-unsupported",
    impact: "blocking",
    explanation: `${required ? "Required" : "Advisory"} llm-core model requirements and their resolution authority have no exact AgentSpec representation.`,
    nodeId,
  });

const SAFE_CAPABILITIES = [
  "IncludeToolReturnSchemas",
  "RaiseContentFilterError",
  "ReinjectSystemPrompt",
] as const satisfies readonly PydanticAiSafeCapability[];

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

export const capabilityIssues = (
  capabilities: unknown,
  nodeId: SpecificationDiagnostic["nodeId"],
): readonly SpecificationDiagnostic[] => {
  if (capabilities === undefined) return [];
  if (!Array.isArray(capabilities)) {
    return [
      issue({
        ...pydanticDiagnostics.capabilitiesInvalid,
        nodeId,
      }),
    ];
  }
  return capabilities.flatMap((capability: unknown) => {
    if (typeof capability === "string" && SAFE_CAPABILITIES.some((safe) => safe === capability))
      return [];
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
