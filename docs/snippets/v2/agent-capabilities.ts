import {
  prepareAgentSpec,
  type AgentRun,
  type AgentRunner,
  type RunResult,
} from "@geekist/llm-core/agent";
import { contractVersion } from "@geekist/llm-core/contracts";

const spec = prepareAgentSpec({
  agentId: "example.support",
  version: contractVersion("2.0.0"),
  instructions: "Answer from the supplied context.",
  effectRequirement: "read-only",
});

declare const runner: AgentRunner;
declare const run: AgentRun;
declare const result: RunResult;

void spec;
void runner;
void run;
void result;
