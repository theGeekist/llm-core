import { contractVersion, digest, extensionNamespace } from "#contracts";
import { maybeMap, type MaybePromise } from "#shared/maybe";
import type {
  CompiledSpecification,
  SpecificationAdapterSupport,
  SpecificationDecision,
  SpecificationDiagnostic,
  SpecificationOperation,
  SpecificationProjectionView,
} from "@geekist/llm-core/specifications";
import {
  createSpecificationAdapterSupport,
  createSpecificationOperation,
  projectSpecification,
} from "@geekist/llm-core/specifications";
import type {
  PydanticAgentDefinition,
  PydanticAiCompilation,
  PydanticAiCompilationTarget,
  PydanticAiSafeCapability,
} from "./types";
import { PydanticAiUnsupportedSemanticsError } from "./types";

import { issue, reviewedSemanticIssues } from "./semantic-review";

export const PYDANTIC_AI_AGENT_SPEC_VERSION = "2.19.0" as const;

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
          ? Object.keys(capability as object)[0]
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

const assertRetries = (retries: unknown): void => {
  if (retries === undefined) return;
  if (
    typeof retries !== "object" ||
    retries === null ||
    Array.isArray(retries) ||
    Object.keys(retries).length !== 2 ||
    !("tools" in retries) ||
    !("output" in retries) ||
    !Number.isInteger(retries.tools) ||
    (retries.tools as number) < 0 ||
    !Number.isInteger(retries.output) ||
    (retries.output as number) < 0
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
