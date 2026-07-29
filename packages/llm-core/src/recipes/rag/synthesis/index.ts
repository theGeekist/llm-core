import { bindFirst } from "#shared/fp";
import { maybeMap } from "#shared/maybe";
import { Recipe } from "../../flow";
import { defineSinglePackRecipe } from "../../handle";
import type { RecipeDefaults, StepApply } from "../../flow";
import { RagStateHelpers, type RagState } from "../shared";
import type { ModelResult } from "#adapters/types";

export type RagSynthesisConfig = {
  defaults?: RecipeDefaults;
};

// Uses the model adapter to synthesize a response from the current RAG state.
const applyResponse = (rag: RagState, result: ModelResult | undefined) => {
  if (result) {
    RagStateHelpers.applyModelResponse(rag, result);
  }
  return null;
};

const applySynthesis: StepApply = ({ context, state }) => {
  const rag = RagStateHelpers.readRagState(state);
  const model = RagStateHelpers.readModel(context);
  const prompt = RagStateHelpers.buildPrompt(rag);
  const system = RagStateHelpers.readSystem(context);
  const result = RagStateHelpers.runModel({
    model,
    call: system ? { prompt, system } : { prompt },
  });
  if (result === null) {
    return null;
  }
  return maybeMap(bindFirst(applyResponse, rag), result);
};

type PackTools = Parameters<typeof Recipe.pack>[1] extends (tools: infer T) => unknown ? T : never;

const defineSynthesisSteps = ({ step }: PackTools) => ({
  synthesize: step("synthesize", applySynthesis).dependsOn("rag-retrieval.retrieve"),
});

export const createRagSynthesisPack = (config?: RagSynthesisConfig) =>
  Recipe.pack("rag-synthesis", defineSynthesisSteps, {
    defaults: config?.defaults,
    minimumCapabilities: ["model"],
  });

// Use when you want a model-only synthesis step that can be shared across flows.
const synthesis = defineSinglePackRecipe("rag", createRagSynthesisPack);
export const createRagSynthesisRecipe = synthesis.createRecipe;
export const RagSynthesisPack = synthesis.pack;
