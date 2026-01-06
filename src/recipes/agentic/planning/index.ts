import { bindFirst, maybeMap } from "../../../shared/maybe";
import { Recipe } from "../../flow";
import { createRecipeFactory, createRecipeHandle } from "../../handle";
import type { RecipeDefaults, StepApply } from "../../flow";
import { AgentStateHelpers, type AgentState } from "../shared";
import type { ModelResult } from "../../../adapters/types";

export type AgentPlanningConfig = {
  defaults?: RecipeDefaults;
};

const applySeed: StepApply = ({ input, state }) => {
  const agent = AgentStateHelpers.readAgentState(state);
  const parsed = AgentStateHelpers.readAgentInput(input);
  AgentStateHelpers.setAgentInput(agent, parsed);
  return null;
};

const applyPlanResult = (agent: AgentState, result: ModelResult | null) => {
  if (result) {
    AgentStateHelpers.applyModelResult(agent, result);
  }
  return null;
};

const applyPlan: StepApply = ({ context, state }) => {
  const agent = AgentStateHelpers.readAgentState(state);
  const model = AgentStateHelpers.readModel(context);
  const call = AgentStateHelpers.createCall(agent, {});
  return maybeMap(bindFirst(applyPlanResult, agent), AgentStateHelpers.runModel(model, call));
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const definePlanningSteps = ({ step }: PackTools) => ({
  seed: step("seed", applySeed),
  plan: step("plan", applyPlan).dependsOn("seed"),
});

export const createAgentPlanningPack = (config?: AgentPlanningConfig) =>
  Recipe.pack("agent-planning", definePlanningSteps, {
    defaults: config?.defaults,
    minimumCapabilities: ["model"],
  });

const resolvePlanningPack = (config?: AgentPlanningConfig) =>
  config ? createAgentPlanningPack(config) : AgentPlanningPack;

const resolvePlanningRecipeDefinition = (config?: AgentPlanningConfig) => ({
  packs: [resolvePlanningPack(config)],
});

const planningRecipeFactory = createRecipeFactory("agent", resolvePlanningRecipeDefinition);

export const createAgentPlanningRecipe = (config?: AgentPlanningConfig) =>
  createRecipeHandle(planningRecipeFactory, config);

export const AgentPlanningPack = createAgentPlanningPack();
export const agentPlanningRecipe = createAgentPlanningRecipe();
