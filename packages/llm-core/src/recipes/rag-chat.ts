import { createRagRecipe } from "./rag";
import { createSystemPlugin } from "./system";

export type RagChatConfig = {
  system?: string;
};

const createSynthesisDefaults = (config?: RagChatConfig) =>
  config?.system ? { plugins: [createSystemPlugin(config.system)] } : undefined;

export const ragChat = (config?: RagChatConfig) =>
  createRagRecipe({
    synthesis: { defaults: createSynthesisDefaults(config) },
  });
