import { createHash, randomBytes } from "node:crypto";
import {
  contractVersion,
  newCoreId,
  type ContractVersion,
  type EventId,
  type InvocationId,
  type JsonValue,
  type RunId,
} from "#contracts";
import { isPromiseLike, type MaybePromise } from "#shared/maybe";
import { createLocalAgentRunner, createModelToolAgentProgram } from "../application/agent/public";
import {
  readCompiledSpecificationAuthority,
  verifyCompilationAuthority,
} from "../application/specification-compiler/runtime";
import type {
  CompiledSpecification,
  SpecificationAuthorityDependencies,
} from "../application/specification-compiler/types";
import type { AgentDefinition } from "../features/agent/public";
import type { Model } from "../features/model/public";
import { readExecutableTool, type ToolDefinition } from "../features/tooling/runtime";
import type { Tool } from "../features/tooling/public";
import type { AgentResult, AgentRun } from "../features/agent/public";

/** A target-neutral plan that can authorize the common Agent journey. */
export interface ExecutionPlan {
  readonly agent: AgentDefinition;
  readonly model: {
    readonly profileId: Model["profile"]["profileId"];
    readonly version: Model["profile"]["version"];
  };
  readonly tools: readonly Pick<ToolDefinition, "id" | "version">[];
}

export interface AgentConfig {
  readonly model: Model;
  readonly instructions?: string;
  readonly tools?: readonly Tool[];
  readonly id?: string;
  readonly version?: ContractVersion;
  /** A registered compilation; its raw value is never accepted on its own. */
  readonly specification?: CompiledSpecification<ExecutionPlan>;
  /** Required with specification so current authority can be rechecked. */
  readonly specificationAuthority?: SpecificationAuthorityDependencies;
}

export interface Agent {
  run(input: JsonValue): MaybePromise<AgentResult>;
  start(input: JsonValue): AgentRun;
}

const uuidV7 = <TId extends EventId | InvocationId | RunId>(): TId => {
  const timestamp = Date.now().toString(16).padStart(12, "0").slice(-12);
  const random = randomBytes(10).toString("hex");
  const variant = ((Number.parseInt(random[3]!, 16) & 0x3) | 0x8).toString(16);
  return newCoreId<TId>(
    `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${random.slice(0, 3)}-${variant}${random.slice(4, 7)}-${random.slice(7, 19)}`,
  );
};

const generatedAgentId = (instructions: string, model: Model): string =>
  `agent.${createHash("sha256")
    .update(instructions, "utf8")
    .update("\0")
    .update(model.profile.profileId, "utf8")
    .digest("hex")
    .slice(0, 16)}`;

const sameToolIdentity = (
  expected: readonly Pick<ToolDefinition, "id" | "version">[],
  actual: readonly Pick<ToolDefinition, "id" | "version">[],
): boolean =>
  expected.length === actual.length &&
  expected.every(
    (tool, index) => tool.id === actual[index]?.id && tool.version === actual[index]?.version,
  );

const verifiedExecutionPlan = (
  config: AgentConfig,
): {
  readonly plan: ExecutionPlan;
  readonly authority: SpecificationAuthorityDependencies;
} | null => {
  const specification = config.specification;
  if (specification === undefined) return null;
  const authority =
    config.specificationAuthority ?? readCompiledSpecificationAuthority(specification);
  const verified = verifyCompilationAuthority({
    compiled: specification,
    authority,
  });
  if (isPromiseLike(verified)) {
    throw new TypeError("The common Agent facade requires synchronous specification authority.");
  }
  return { plan: specification.value, authority };
};

const definitionFor = (input: {
  readonly config: AgentConfig;
  readonly plan: ExecutionPlan | undefined;
  readonly tools: readonly ToolDefinition[];
}): AgentDefinition => {
  const { config, plan, tools } = input;
  if (plan === undefined) {
    if (typeof config.instructions !== "string" || config.instructions.length === 0) {
      throw new TypeError("Agents require a model and non-empty instructions.");
    }
    return {
      agentId: config.id ?? generatedAgentId(config.instructions, config.model),
      version: config.version ?? contractVersion("1.0.0"),
      instructions: config.instructions,
      effectRequirement: "read-only",
    };
  }
  if (
    plan.agent === undefined ||
    plan.model?.profileId !== config.model.profile.profileId ||
    plan.model.version !== config.model.profile.version ||
    !sameToolIdentity(plan.tools ?? [], tools)
  ) {
    throw new TypeError(
      "Compiled Agent specifications must match the configured execution inputs.",
    );
  }
  if (
    (config.instructions !== undefined && config.instructions !== plan.agent.instructions) ||
    (config.id !== undefined && config.id !== plan.agent.agentId) ||
    (config.version !== undefined && config.version !== plan.agent.version)
  ) {
    throw new TypeError("Agent configuration cannot substitute compiled specification inputs.");
  }
  return plan.agent;
};

/**
 * Creates the common ready Agent facade.
 *
 * Meaningful tool effects remain fail-closed until a controlled runtime is
 * selected explicitly through `./agent/runtime`.
 */
export const createAgent = (config: AgentConfig): Agent => {
  if (typeof config.model?.generate !== "function") {
    throw new TypeError("Agents require a model.");
  }
  const tools = (config.tools ?? []).map(readExecutableTool);
  if (tools.some((tool) => tool.definition.effect.class !== "read-only")) {
    throw new TypeError(
      "Common agents accept read-only tools; meaningful effects require an explicit controlled runtime.",
    );
  }
  const verified = verifiedExecutionPlan(config);
  const definition = definitionFor({
    config,
    plan: verified?.plan,
    tools: tools.map((tool) => tool.definition),
  });
  const runner = createLocalAgentRunner({
    identity: {
      newRunId: uuidV7,
      newEventId: uuidV7,
      now: () => new Date().toISOString(),
    },
    program: createModelToolAgentProgram({ model: config.model, tools }),
    runnerId: "llm-core.agent.local",
    runnerVersion: contractVersion("1.0.0"),
    ...(config.specification === undefined || verified === null
      ? {}
      : {
          specification: {
            compiled: config.specification,
            authority: verified.authority,
          },
        }),
  });
  const prepared = runner.prepare(definition);
  if (isPromiseLike(prepared)) {
    throw new TypeError("The common local agent must prepare synchronously.");
  }
  const start = (input: JsonValue): AgentRun => {
    const run = runner.start({
      agent: prepared,
      invocationContext: { invocationId: uuidV7() },
      input,
    });
    if (isPromiseLike(run)) {
      throw new TypeError("The common local agent must start synchronously.");
    }
    return run;
  };
  return Object.freeze({
    start,
    run: (input: JsonValue) => start(input).result(),
  });
};
