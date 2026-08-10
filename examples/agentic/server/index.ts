import { contractVersion, newCoreId, type InvocationId } from "@geekist/llm-core/contracts";
import type { AgentRunner } from "@geekist/llm-core/agent/runtime";

const agent = {
  agentId: "example.agentic.echo",
  version: contractVersion("2.0.0"),
  instructions: "Return the supplied input.",
  effectRequirement: "read-only",
} as const;

export const runAgenticFixture = async (runner: AgentRunner) => {
  const prepared = await runner.prepare(agent);
  const run = await runner.start({
    agent: prepared,
    invocationContext: {
      invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01"),
    },
    input: { prompt: "hello" },
  });

  for await (const event of run.events()) {
    console.log(event.kind);
  }
  return run.result();
};
