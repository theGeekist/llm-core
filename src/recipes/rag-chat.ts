import type { Plugin } from "../workflow/types";
import { Recipe } from "./flow";
import { createRecipeFactory, createRecipeHandle } from "./handle";
import { createSystemPlugin } from "./system";

export type RagChatConfig = {
  model?: string;
  retriever?: string;
  system?: string;
};

const createModelPlugin = (model: string): Plugin => ({
  key: "config.model",
  capabilities: {
    model: { name: model },
  },
});

const createRetrieverPlugin = (retriever: string): Plugin => ({
  key: "config.retriever",
  capabilities: {
    retriever: { name: retriever },
  },
});

const defineRagChatSteps = () => ({});

const createRagChatPack = (config?: RagChatConfig) => {
  const plugins: Plugin[] = [];
  if (config?.model) {
    plugins.push(createModelPlugin(config.model));
  }
  if (config?.retriever) {
    plugins.push(createRetrieverPlugin(config.retriever));
  }
  if (config?.system) {
    plugins.push(createSystemPlugin(config.system));
  }
  const defaults = plugins.length > 0 ? { plugins } : undefined;
  return Recipe.pack("rag-chat", defineRagChatSteps, {
    defaults,
    minimumCapabilities: ["model", "retriever"],
  });
};

const resolveRagChatPack = (config?: RagChatConfig) =>
  config ? createRagChatPack(config) : RagChatPack;

const resolveRagChatRecipeDefinition = (config?: RagChatConfig) => ({
  packs: [resolveRagChatPack(config)],
});

const ragChatRecipeFactory = createRecipeFactory("rag", resolveRagChatRecipeDefinition);

export const ragChat = (config?: RagChatConfig) => createRecipeHandle(ragChatRecipeFactory, config);

export const RagChatPack = createRagChatPack();
