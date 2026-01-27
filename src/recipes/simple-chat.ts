import { Recipe } from "./flow";
import { createRecipeFactory, createRecipeHandle } from "./handle";
import { createSystemPlugin } from "./system";
import type { Plugin } from "#workflow/types";
import { AgentStateHelpers, type AgentState } from "./agentic/shared";
import { bindFirst } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import type { StepApply } from "./flow";
import type { ModelResult } from "#adapters/types";

export type SimpleChatConfig = {
  model?: string;
  system?: string;
};

const createModelPlugin = (model: string): Plugin => ({
  key: "config.model",
  capabilities: {
    model: { name: model },
  },
});

const readSystemPrompt = (context: unknown) => {
  if (!context || typeof context !== "object") {
    return null;
  }
  const record = context as { system?: unknown };
  return typeof record.system === "string" ? record.system : null;
};

export const __test__ = {
  readSystemPrompt,
};

const applySeed: StepApply = ({ input, context, state }) => {
  const agent = AgentStateHelpers.readAgentState(state);
  const parsed = AgentStateHelpers.readAgentInput(input);
  AgentStateHelpers.setAgentInput(agent, parsed);
  const system = readSystemPrompt(context);
  if (system) {
    agent.context = system;
  }
  return null;
};

const applyResponseResult = (agent: AgentState, result: ModelResult | null) => {
  if (result) {
    if (result.text !== undefined) {
      agent.response = result.text ?? undefined;
    }
    if (result.messages) {
      agent.messages = result.messages;
    }
  }
  return null;
};

const applyRespond: StepApply = ({ context, state }) => {
  const agent = AgentStateHelpers.readAgentState(state);
  const model = AgentStateHelpers.readModel(context);
  const call = AgentStateHelpers.createCall(agent, {});
  return maybeMap(bindFirst(applyResponseResult, agent), AgentStateHelpers.runModel(model, call));
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineSimpleChatSteps = ({ step }: PackTools) => ({
  seed: step("seed", applySeed),
  respond: step("respond", applyRespond).dependsOn("seed"),
});

const createSimpleChatPack = (config?: SimpleChatConfig) => {
  const plugins: Plugin[] = [];
  if (config?.model) {
    plugins.push(createModelPlugin(config.model));
  }
  if (config?.system) {
    plugins.push(createSystemPlugin(config.system));
  }
  const defaults = plugins.length > 0 ? { plugins } : undefined;
  return Recipe.pack("simple-chat", defineSimpleChatSteps, {
    defaults,
    minimumCapabilities: ["model"],
  });
};

const resolveSimpleChatPack = (config?: SimpleChatConfig) =>
  config ? createSimpleChatPack(config) : SimpleChatPack;

const resolveSimpleChatRecipeDefinition = (config?: SimpleChatConfig) => ({
  packs: [resolveSimpleChatPack(config)],
});

const simpleChatRecipeFactory = createRecipeFactory("agent", resolveSimpleChatRecipeDefinition);

export const simpleChat = (config?: SimpleChatConfig) =>
  createRecipeHandle(simpleChatRecipeFactory, config);

export const SimpleChatPack = createSimpleChatPack();
