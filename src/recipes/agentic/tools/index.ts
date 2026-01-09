import { bindFirst } from "../../../shared/fp";
import { maybeMap } from "../../../shared/maybe";
import { Recipe } from "../../flow";
import { createRecipeFactory, createRecipeHandle } from "../../handle";
import type { RecipeDefaults, StepApply } from "../../flow";
import { AgentStateHelpers, type AgentState } from "../shared";
import type { ModelResult, ToolResult } from "../../../adapters/types";

export type AgentToolsConfig = {
  defaults?: RecipeDefaults;
};

const applyToolCallResult = (agent: AgentState, result: ModelResult | null) => {
  if (result) {
    AgentStateHelpers.applyModelResult(agent, result);
  }
  return null;
};

const applyToolCalls: StepApply = ({ context, state }) => {
  const agent = AgentStateHelpers.readAgentState(state);
  const model = AgentStateHelpers.readModel(context);
  const tools = AgentStateHelpers.readTools(context);
  const call = AgentStateHelpers.createCall(agent, { tools });
  return maybeMap(bindFirst(applyToolCallResult, agent), AgentStateHelpers.runModel(model, call));
};

const applyToolResults = (agent: AgentState, results: ToolResult[] | undefined) => {
  if (results) {
    AgentStateHelpers.applyToolResults(agent, results);
  }
  return null;
};

const readToolCalls = (agent: AgentState) => agent.toolCalls ?? [];

const applyToolExecution: StepApply = ({ context, state }) => {
  const agent = AgentStateHelpers.readAgentState(state);
  const tools = AgentStateHelpers.readTools(context);
  const calls = readToolCalls(agent);
  if (calls.length === 0) {
    return null;
  }
  return maybeMap(
    bindFirst(applyToolResults, agent),
    AgentStateHelpers.executeToolCalls(tools, calls),
  );
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineToolSteps = ({ step }: PackTools) => ({
  "tool-call": step("tool-call", applyToolCalls).dependsOn("agent-planning.plan"),
  "tool-exec": step("tool-exec", applyToolExecution).dependsOn("tool-call"),
});

export const createAgentToolsPack = (config?: AgentToolsConfig) =>
  Recipe.pack("agent-tools", defineToolSteps, {
    defaults: config?.defaults,
    minimumCapabilities: ["model", "tools"],
  });

const resolveToolsPack = (config?: AgentToolsConfig) =>
  config ? createAgentToolsPack(config) : AgentToolsPack;

const resolveToolsRecipeDefinition = (config?: AgentToolsConfig) => ({
  packs: [resolveToolsPack(config)],
});

const toolsRecipeFactory = createRecipeFactory("agent", resolveToolsRecipeDefinition);

export const createAgentToolsRecipe = (config?: AgentToolsConfig) =>
  createRecipeHandle(toolsRecipeFactory, config);

export const AgentToolsPack = createAgentToolsPack();
export const agentToolsRecipe = createAgentToolsRecipe();
