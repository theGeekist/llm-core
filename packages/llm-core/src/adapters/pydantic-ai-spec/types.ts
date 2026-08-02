import type { CapabilityRequirement, JsonObject } from "#contracts";
import type { AgentDefinition } from "@geekist/llm-core/agent/runtime";
import type { ContextSelection } from "@geekist/llm-core/context";
import type { EvaluationQualification } from "@geekist/llm-core/evaluation";
import type { PromptTemplate, ToolDeclaration } from "@geekist/llm-core/model";
import type {
  CompiledSpecification,
  ConversionReport,
  SpecificationScopeId,
} from "@geekist/llm-core/specifications";

/** Exact JSON-shaped AgentSpec boundary assessed at PydanticAI v2.19.0. */
export interface PydanticAgentDefinition {
  readonly model: string;
  readonly name?: string;
  readonly description?: string;
  readonly instructions?: string | readonly string[];
  readonly deps_schema?: JsonObject;
  readonly output_schema?: JsonObject;
  readonly model_settings?: JsonObject;
  readonly retries?: PydanticAiRetryBudget;
  readonly end_strategy?: "early" | "graceful" | "exhaustive";
  readonly tool_timeout?: number;
  readonly metadata?: JsonObject;
  readonly capabilities?: readonly PydanticAiSafeCapability[];
}

/** The explicit retry form qualified against PydanticAI AgentSpec 2.19.0. */
export interface PydanticAiRetryBudget {
  readonly tools: number;
  readonly output: number;
}

/**
 * Closed, non-effectful AgentSpec capability subset qualified at 2.19.0.
 * Parameterized, custom, tool-providing, network, and telemetry capabilities
 * remain unsupported until separately assessed.
 */
export type PydanticAiSafeCapability =
  | "IncludeToolReturnSchemas"
  | "RaiseContentFilterError"
  | "ReinjectSystemPrompt";

/**
 * Explicit review accounting for portable categories that do not all have a
 * safe AgentSpec representation. Values are assertions only: the compiler
 * derives the same categories from authority-bound accepted item content and
 * requires an exact match before applying a disposition.
 */
export interface PydanticAiReviewedSemantics {
  /**
   * Each category must name the complete accepted scope whose public review
   * items were inspected. Scope equality is necessary but is not evidence of
   * semantic absence; the corresponding value must also equal accepted item
   * content.
   */
  readonly reviewedScope: {
    readonly modelRequirements: readonly SpecificationScopeId[];
    readonly prompt: readonly SpecificationScopeId[];
    readonly tools: readonly SpecificationScopeId[];
    readonly context: readonly SpecificationScopeId[];
    readonly evaluation: readonly SpecificationScopeId[];
  };
  readonly modelRequirements: readonly CapabilityRequirement[];
  readonly prompt: PromptTemplate | null;
  readonly tools: readonly ToolDeclaration[];
  readonly context: ContextSelection | null;
  readonly evaluation: EvaluationQualification | null;
}

export interface PydanticAiCompilationTarget {
  readonly agent: AgentDefinition;
  readonly semantics: PydanticAiReviewedSemantics;
  /** Exact PydanticAI model identifier, for example `openai:gpt-5.2`. */
  readonly model: string;
  readonly description?: string;
  readonly depsSchema?: JsonObject;
  readonly outputSchema?: JsonObject;
  readonly modelSettings?: JsonObject;
  readonly retries?: PydanticAgentDefinition["retries"];
  readonly endStrategy?: PydanticAgentDefinition["end_strategy"];
  readonly toolTimeout?: number;
  readonly capabilities?: readonly PydanticAiSafeCapability[];
}

export interface PydanticAiCompilation {
  readonly compiled: CompiledSpecification<PydanticAgentDefinition>;
  readonly report: ConversionReport;
}

export class PydanticAiUnsupportedSemanticsError extends TypeError {
  readonly report: ConversionReport;

  constructor(report: ConversionReport) {
    super("PydanticAI AgentSpec projection contains unsupported semantics.");
    this.name = "PydanticAiUnsupportedSemanticsError";
    this.report = report;
  }
}
