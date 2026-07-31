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
import type { Model } from "../features/model/public";
import { readExecutableTool } from "../features/tooling/runtime";
import type { Tool } from "../features/tooling/public";
import type { AgentResult, AgentRun } from "../features/agent/public";

export interface AgentConfig {
  readonly model: Model;
  readonly instructions: string;
  readonly tools?: readonly Tool[];
  readonly id?: string;
  readonly version?: ContractVersion;
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

const generatedAgentId = (config: AgentConfig): string =>
  `agent.${createHash("sha256")
    .update(config.instructions, "utf8")
    .update("\0")
    .update(config.model.profile.profileId, "utf8")
    .digest("hex")
    .slice(0, 16)}`;

/**
 * Creates the common ready Agent facade.
 *
 * Meaningful tool effects remain fail-closed until a controlled runtime is
 * selected explicitly through `./agent/runtime`.
 */
export const createAgent = (config: AgentConfig): Agent => {
  if (
    typeof config.instructions !== "string" ||
    config.instructions.length === 0 ||
    typeof config.model?.generate !== "function"
  ) {
    throw new TypeError("Agents require a model and non-empty instructions.");
  }
  const tools = (config.tools ?? []).map(readExecutableTool);
  if (tools.some((tool) => tool.definition.effect.class !== "read-only")) {
    throw new TypeError(
      "Common agents accept read-only tools; meaningful effects require an explicit controlled runtime.",
    );
  }
  const runner = createLocalAgentRunner({
    identity: {
      newRunId: uuidV7,
      newEventId: uuidV7,
      now: () => new Date().toISOString(),
    },
    program: createModelToolAgentProgram({ model: config.model, tools }),
    runnerId: "llm-core.agent.local",
    runnerVersion: contractVersion("1.0.0"),
  });
  const prepared = runner.prepare({
    agentId: config.id ?? generatedAgentId(config),
    version: config.version ?? contractVersion("1.0.0"),
    instructions: config.instructions,
    effectRequirement: "read-only",
  });
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
