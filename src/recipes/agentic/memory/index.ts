import { bindFirst, maybeMap, toNull } from "../../../maybe";
import { Recipe } from "../../flow";
import { createRecipeFactory, createRecipeHandle } from "../../handle";
import type { RecipeDefaults, StepApply } from "../../flow";
import { AgentStateHelpers, type AgentState } from "../shared";
import type { Memory } from "../../../adapters/types";

export type AgentMemoryConfig = {
  defaults?: RecipeDefaults;
};

const readMemory = (memory: Memory | undefined) => memory;

const buildMemoryInput = (agent: AgentState): Record<string, unknown> => ({
  input: agent.input,
  context: agent.context,
  plan: agent.plan,
  toolCalls: agent.toolCalls,
  toolResults: agent.toolResults,
  response: agent.response,
});

const applyMemoryLoadResult = (agent: AgentState, result: Record<string, unknown> | undefined) => {
  if (result) {
    agent.memory = result;
  }
  return null;
};

const applyMemoryLoad: StepApply = ({ context, state }) => {
  const agent = AgentStateHelpers.readAgentState(state);
  const memory = readMemory(context.adapters?.memory);
  if (!memory?.load) {
    return null;
  }
  return maybeMap(bindFirst(applyMemoryLoadResult, agent), memory.load(buildMemoryInput(agent)));
};

const applyMemorySave: StepApply = ({ context, state }) => {
  const agent = AgentStateHelpers.readAgentState(state);
  const memory = readMemory(context.adapters?.memory);
  if (!memory?.save) {
    return null;
  }
  return maybeMap(toNull, memory.save(buildMemoryInput(agent), { response: agent.response ?? "" }));
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineMemorySteps = ({ step }: PackTools) => ({
  load: step("load", applyMemoryLoad),
  save: step("save", applyMemorySave).dependsOn("agent-finalize.respond"),
});

export const createAgentMemoryPack = (config?: AgentMemoryConfig) =>
  Recipe.pack("agent-memory", defineMemorySteps, {
    defaults: config?.defaults,
  });

const resolveMemoryPack = (config?: AgentMemoryConfig) =>
  config ? createAgentMemoryPack(config) : AgentMemoryPack;

const resolveMemoryRecipeDefinition = (config?: AgentMemoryConfig) => ({
  packs: [resolveMemoryPack(config)],
});

const memoryRecipeFactory = createRecipeFactory("agent", resolveMemoryRecipeDefinition);

export const createAgentMemoryRecipe = (config?: AgentMemoryConfig) =>
  createRecipeHandle(memoryRecipeFactory, config);

export const AgentMemoryPack = createAgentMemoryPack();
export const agentMemoryRecipe = createAgentMemoryRecipe();
