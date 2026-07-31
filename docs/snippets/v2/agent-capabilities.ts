import { createAgent, type Agent, type AgentResult, type AgentRun } from "@geekist/llm-core";
import type { Model } from "@geekist/llm-core/model";

declare const model: Model;

const agent: Agent = createAgent({
  model,
  instructions: "Answer from the supplied context.",
});

const run: AgentRun = agent.start({ question: "What changed?" });
const result: AgentResult = await run.result();

console.log(result.status);
