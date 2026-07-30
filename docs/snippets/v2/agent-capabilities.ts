import {
  type AgentSpec,
  type AgentRun,
  type AgentRunner,
  type RunResult,
} from "@geekist/llm-core/agent";
import { contractVersion } from "@geekist/llm-core/contracts";

const spec: AgentSpec = {
  agentId: "example.support",
  version: contractVersion("2.0.0"),
  instructions: "Answer from the supplied context.",
  effectRequirement: "read-only",
};

declare const runner: AgentRunner;
const prepared = await runner.prepare(spec);
declare const run: AgentRun;
declare const result: RunResult;

void spec;
void prepared;
void runner;
void run;
void result;
