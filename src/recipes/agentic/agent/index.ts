import { createRecipeFactory, createRecipeHandle } from "../../handle";
import { AgentPlanningPack, createAgentPlanningPack, type AgentPlanningConfig } from "../planning";
import { AgentToolsPack, createAgentToolsPack, type AgentToolsConfig } from "../tools";
import { AgentMemoryPack, createAgentMemoryPack, type AgentMemoryConfig } from "../memory";
import { AgentFinalizePack, createAgentFinalizePack, type AgentFinalizeConfig } from "../finalize";

export type AgentRecipeConfig = {
  planning?: AgentPlanningConfig;
  tools?: AgentToolsConfig;
  memory?: AgentMemoryConfig;
  finalize?: AgentFinalizeConfig;
};

const resolvePlanningPack = (config?: AgentPlanningConfig) =>
  config ? createAgentPlanningPack(config) : AgentPlanningPack;

const resolveToolsPack = (config?: AgentToolsConfig) =>
  config ? createAgentToolsPack(config) : AgentToolsPack;

const resolveMemoryPack = (config?: AgentMemoryConfig) =>
  config ? createAgentMemoryPack(config) : AgentMemoryPack;

const resolveFinalizePack = (config?: AgentFinalizeConfig) =>
  config ? createAgentFinalizePack(config) : AgentFinalizePack;

const resolveAgentRecipeDefinition = (config?: AgentRecipeConfig) => ({
  packs: [
    resolvePlanningPack(config?.planning),
    resolveToolsPack(config?.tools),
    resolveFinalizePack(config?.finalize),
    resolveMemoryPack(config?.memory),
  ],
});

const agentRecipeFactory = createRecipeFactory("agent", resolveAgentRecipeDefinition);

export const createAgentRecipe = (config?: AgentRecipeConfig) =>
  createRecipeHandle(agentRecipeFactory, config);

export const agentRecipe = createAgentRecipe();
