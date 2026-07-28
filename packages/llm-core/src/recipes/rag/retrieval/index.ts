import { Recipe } from "../../flow";
import { defineSinglePackRecipe } from "../../handle";
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

// Use when you want a retriever-first pack that is easily composed into larger flows.
const retrieval = defineSinglePackRecipe("rag", createRagRetrievalPack);
export const createRagRetrievalRecipe = retrieval.createRecipe;
export const RagRetrievalPack = retrieval.pack;
export const ragRetrievalRecipe = createRagRetrievalRecipe();
