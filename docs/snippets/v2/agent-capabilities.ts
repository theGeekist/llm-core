import type {
  AgentDefinition,
  AgentResult,
  AgentRunner,
  AgentStartRequest,
} from "@aifsd/llm-core/agent/runtime";

declare const runner: AgentRunner;
declare const definition: AgentDefinition;
declare const request: Omit<AgentStartRequest, "agent">;

const prepared = await runner.prepare(definition);
const run = await runner.start({ ...request, agent: prepared });
const result: AgentResult = await run.result();

console.log(result.status);
