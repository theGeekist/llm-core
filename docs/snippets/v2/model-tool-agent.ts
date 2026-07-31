import {
  createLocalAgentRunner,
  createModelToolAgentProgram,
  type AgentRunIdentityPort,
} from "@geekist/llm-core/agent/runtime";
import type { ContractVersion } from "@geekist/llm-core/contracts";
import type { ConversationStore } from "@geekist/llm-core/memory";
import type { Model } from "@geekist/llm-core/model";
import type { ExecutableTool } from "@geekist/llm-core/tools/runtime";

declare const model: Model;
declare const readOnlyTools: readonly ExecutableTool[];
declare const conversation: ConversationStore;
declare const identity: AgentRunIdentityPort;
declare const runnerVersion: ContractVersion;

const program = createModelToolAgentProgram({
  model,
  tools: readOnlyTools,
  conversation,
  maxModelCalls: 8,
});

const runner = createLocalAgentRunner({
  identity,
  runnerId: "example.model-tool",
  runnerVersion,
  program,
});

console.log(await runner.capabilities());
