import type { Plugin } from "#workflow/types";
import { Recipe } from "./flow";
import { defineSinglePackRecipe } from "./handle";
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

const chat = defineSinglePackRecipe("rag", createRagChatPack);
export const ragChat = chat.createRecipe;
export const RagChatPack = chat.pack;
