import { Recipe } from "../../flow";
import { createRecipeFactory, createRecipeHandle } from "../../handle";
import type { RecipeDefaults, StepApply } from "../../flow";
import { RagStateHelpers } from "../shared";

export type RagRetrievalConfig = {
  defaults?: RecipeDefaults;
};

// Seeds RAG state from input and populates documents via retriever (plus optional reranker).
const applySeed: StepApply = ({ input, state }) => {
  const rag = RagStateHelpers.readRagState(state);
  const parsed = RagStateHelpers.readRagInput(input);
  RagStateHelpers.setRagInput(rag, parsed);
  return null;
};

const applyRetrieve: StepApply = ({ context, state }) => {
  const rag = RagStateHelpers.readRagState(state);
  const retriever = RagStateHelpers.readRetriever(context);
  const reranker = RagStateHelpers.readReranker(context);
  const query = RagStateHelpers.resolveQuery(rag);
  return RagStateHelpers.runRetrieve({ retriever, query, rag, reranker });
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineRetrievalSteps = ({ step }: PackTools) => ({
  seed: step("seed", applySeed),
  retrieve: step("retrieve", applyRetrieve).dependsOn("seed"),
});

export const createRagRetrievalPack = (config?: RagRetrievalConfig) =>
  Recipe.pack("rag-retrieval", defineRetrievalSteps, {
    defaults: config?.defaults,
    minimumCapabilities: ["retriever"],
  });

const resolveRetrievalPack = (config?: RagRetrievalConfig) =>
  config ? createRagRetrievalPack(config) : RagRetrievalPack;

const resolveRetrievalRecipeDefinition = (config?: RagRetrievalConfig) => ({
  packs: [resolveRetrievalPack(config)],
});

const retrievalRecipeFactory = createRecipeFactory("rag", resolveRetrievalRecipeDefinition);

export const createRagRetrievalRecipe = (config?: RagRetrievalConfig) =>
  createRecipeHandle(retrievalRecipeFactory, config);

// Use when you want a retriever-first pack that is easily composed into larger flows.
export const RagRetrievalPack = createRagRetrievalPack();
export const ragRetrievalRecipe = createRagRetrievalRecipe();
