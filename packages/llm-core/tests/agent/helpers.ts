import { contractVersion } from "#contracts";
import { isPromiseLike } from "#shared/maybe";
import { createLocalAgentRunner } from "../../src/application/agent/public";
import type { AgentDefinition, PreparedAgentDefinition } from "../../src/features/agent/public";

const validatingRunner = createLocalAgentRunner({
  runnerId: "tests.agent-validation",
  runnerVersion: contractVersion("2.0.0"),
  identity: {
    newRunId: () => {
      throw new Error("validation-only runner cannot start");
    },
    newEventId: () => {
      throw new Error("validation-only runner cannot start");
    },
    now: () => {
      throw new Error("validation-only runner cannot start");
    },
  },
  program: {
    execute: () => {
      throw new Error("validation-only runner cannot execute");
    },
  },
});

export const prepareWithLocalRunner = (definition: AgentDefinition): PreparedAgentDefinition => {
  const prepared = validatingRunner.prepare(definition);
  if (isPromiseLike(prepared)) {
    throw new TypeError("The local validation runner must prepare synchronously.");
  }
  return prepared;
};
