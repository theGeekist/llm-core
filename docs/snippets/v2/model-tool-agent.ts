import { createLocalAgentRunner } from "@geekist/llm-core";
import {
  createModelToolAgentProgram,
  type AgentRunIdentityPort,
  type ConversationStore,
} from "@geekist/llm-core/agent";
import type { ContractVersion } from "@geekist/llm-core/contracts";
import type { Model } from "@geekist/llm-core/model";
import type { ToolBinding } from "@geekist/llm-core/tools";

declare const model: Model;
declare const readOnlyTools: readonly ToolBinding[];
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
