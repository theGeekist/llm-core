import { createRecipeFactory, createRecipeHandle } from "../handle";
import { createRagRetrievalPack, RagRetrievalPack, type RagRetrievalConfig } from "./retrieval";
import { createRagSynthesisPack, RagSynthesisPack, type RagSynthesisConfig } from "./synthesis";

export type RagRecipeConfig = {
  retrieval?: RagRetrievalConfig;
  synthesis?: RagSynthesisConfig;
};

const resolveRetrievalPack = (config?: RagRetrievalConfig) =>
  config ? createRagRetrievalPack(config) : RagRetrievalPack;

const resolveSynthesisPack = (config?: RagSynthesisConfig) =>
  config ? createRagSynthesisPack(config) : RagSynthesisPack;

const resolveRagRecipeDefinition = (config?: RagRecipeConfig) => ({
  packs: [resolveRetrievalPack(config?.retrieval), resolveSynthesisPack(config?.synthesis)],
});

const ragRecipeFactory = createRecipeFactory("rag", resolveRagRecipeDefinition);

// A full RAG flow: retrieval + synthesis, with per-pack overrides.
export const createRagRecipe = (config?: RagRecipeConfig) =>
  createRecipeHandle(ragRecipeFactory, config);

// Default RAG recipe with standard packs.
export const ragRecipe = createRagRecipe();

export { createRagRetrievalRecipe, ragRetrievalRecipe } from "./retrieval";
export { createRagSynthesisRecipe, ragSynthesisRecipe } from "./synthesis";
