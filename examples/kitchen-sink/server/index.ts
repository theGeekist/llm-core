import { contractVersion, newCoreId, type InvocationId } from "@aifsd/llm-core/contracts";
import type { AgentRunner } from "@aifsd/llm-core/agent/runtime";

export const runKitchenSinkFixture = async (runner: AgentRunner) => {
  const prepared = await runner.prepare({
    agentId: "example.kitchen-sink",
    version: contractVersion("2.0.0"),
    instructions: "Return a portable result.",
    effectRequirement: "read-only",
  });
  const run = await runner.start({
    agent: prepared,
    invocationContext: {
      invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01"),
    },
    input: { prompt: "hello" },
  });

  return run.result();
};
