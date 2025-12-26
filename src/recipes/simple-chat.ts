import type { Plugin } from "../workflow/types";
import { Recipe } from "./flow";
import { createSystemPlugin } from "./system";

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

const createSimpleChatPack = (config?: SimpleChatConfig) => {
  const plugins: Plugin[] = [];
  if (config?.model) {
    plugins.push(createModelPlugin(config.model));
  }
  if (config?.system) {
    plugins.push(createSystemPlugin(config.system));
  }
  const defaults = plugins.length > 0 ? { plugins } : undefined;
  return Recipe.pack("simple-chat", () => ({}), defaults ? { defaults } : undefined);
};

export const simpleChat = (config?: SimpleChatConfig) => {
  const pack = createSimpleChatPack(config);
  return Recipe.flow("agent").use(pack);
};
