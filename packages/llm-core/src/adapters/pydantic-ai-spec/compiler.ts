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
} from "./types";
import { PydanticAiUnsupportedSemanticsError } from "./types";

import { reviewedSemanticIssues } from "./semantic-review";
import { issue, capabilityIssues, pydanticDiagnostics, pydanticAgentSpec } from "./native-contract";

export const PYDANTIC_AI_AGENT_SPEC_VERSION = pydanticAgentSpec.version;

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
        ...pydanticDiagnostics.controlledEffectsUnsupported,
        nodeId,
      }),
    );
  }
  if (target.agent.skills?.length) {
    diagnostics.push(
      issue({
        ...pydanticDiagnostics.agentSkillsUnsupported,
        nodeId,
      }),
    );
  }
  if (target.depsSchema !== undefined) {
    diagnostics.push(
      issue({
        ...pydanticDiagnostics.depsSchemaUnsupported,
        nodeId,
      }),
    );
  }
  if (target.outputSchema !== undefined) {
    diagnostics.push(
      issue({
        ...pydanticDiagnostics.outputSchemaUnsupported,
        nodeId,
      }),
    );
  }
  diagnostics.push(...capabilityIssues(target.capabilities, nodeId));
  const sourceContract = pydanticAgentSpec.source;
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
        fixtures: pydanticAgentSpec.fixtures,
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
    ...pydanticAgentSpec.source,
    sourceOwnership: "source-owned",
    operations: [
      createSpecificationOperation({
        operation: "observe-native-source",
        sourceContract: pydanticAgentSpec.source,
        disposition: "unsupported",
        reason: "PydanticAI AgentSpec native observation is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "derive-portable-specification",
        sourceContract: pydanticAgentSpec.source,
        disposition: "unsupported",
        reason: "PydanticAI AgentSpec portable derivation is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "compile-portable-specification",
        sourceContract: pydanticAgentSpec.source,
        disposition: "supported",
        fixtures: pydanticAgentSpec.fixtures,
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "export-native-source",
        sourceContract: pydanticAgentSpec.source,
        disposition: "unsupported",
        reason: "PydanticAI AgentSpec native export is not implemented.",
        diagnostics: [],
      }),
      createSpecificationOperation({
        operation: "round-trip-native-source",
        sourceContract: pydanticAgentSpec.source,
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
