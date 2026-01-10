import { bindFirst } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import { Recipe } from "../../flow";
import { createRecipeFactory, createRecipeHandle } from "../../handle";
import type { RecipeDefaults, StepApply } from "../../flow";
import { AgentStateHelpers, type AgentState } from "../shared";
import type { ModelResult } from "#adapters/types";

export type AgentFinalizeConfig = {
  defaults?: RecipeDefaults;
};

const formatToolResults = (agent: AgentState) => {
  if (!agent.toolResults || agent.toolResults.length === 0) {
    return "";
  }
  return JSON.stringify(agent.toolResults);
};

const buildResponsePrompt = (agent: AgentState) => {
  const base = agent.input ?? "";
  const tools = formatToolResults(agent);
  return tools ? `${base}\n\nTool results:\n${tools}` : base;
};

const applyResponseResult = (agent: AgentState, result: ModelResult | null) => {
  if (result?.text !== undefined) {
    agent.response = result.text ?? undefined;
  }
  if (result?.messages) {
    agent.messages = result.messages;
  }
  return null;
};

const applyRespond: StepApply = ({ context, state }) => {
  const agent = AgentStateHelpers.readAgentState(state);
  const model = AgentStateHelpers.readModel(context);
  const call = AgentStateHelpers.createCall(agent, { prompt: buildResponsePrompt(agent) });
  return maybeMap(bindFirst(applyResponseResult, agent), AgentStateHelpers.runModel(model, call));
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineFinalizeSteps = ({ step }: PackTools) => ({
  respond: step("respond", applyRespond).dependsOn("agent-tools.tool-exec"),
});

export const createAgentFinalizePack = (config?: AgentFinalizeConfig) =>
  Recipe.pack("agent-finalize", defineFinalizeSteps, {
    defaults: config?.defaults,
    minimumCapabilities: ["model"],
  });

const resolveFinalizePack = (config?: AgentFinalizeConfig) =>
  config ? createAgentFinalizePack(config) : AgentFinalizePack;

const resolveFinalizeRecipeDefinition = (config?: AgentFinalizeConfig) => ({
  packs: [resolveFinalizePack(config)],
});

const finalizeRecipeFactory = createRecipeFactory("agent", resolveFinalizeRecipeDefinition);

export const createAgentFinalizeRecipe = (config?: AgentFinalizeConfig) =>
  createRecipeHandle(finalizeRecipeFactory, config);

export const AgentFinalizePack = createAgentFinalizePack();
export const agentFinalizeRecipe = createAgentFinalizeRecipe();
