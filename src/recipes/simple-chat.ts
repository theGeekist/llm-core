import { Recipe } from "./flow";
import { createRecipeFactory, createRecipeHandle } from "./handle";
import { createSystemPlugin } from "./system";
import type { Plugin } from "#workflow/types";

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

const defineSimpleChatSteps = () => ({});

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
