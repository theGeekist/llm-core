import { describe, expect, it } from "bun:test";
import { getRecipe, registerRecipe } from "#workflow/recipe-registry";
import type { RecipeContract } from "#workflow/types";

describe("Workflow recipe registry", () => {
  const RECIPE_RAG = "rag";
  const ARTEFACT_ANSWER_TEXT = "answer.text";

  it("returns the default recipe contract", () => {
    const contract = getRecipe(RECIPE_RAG);
    expect(contract.name).toBe(RECIPE_RAG);
    expect(contract.artefactKeys).toContain(ARTEFACT_ANSWER_TEXT);
    expect(contract.defaultPlugins?.length).toBeGreaterThan(0);
  });

  it("supports overrides", () => {
    const original = getRecipe(RECIPE_RAG);
    const override: RecipeContract = {
      name: RECIPE_RAG,
      artefactKeys: [ARTEFACT_ANSWER_TEXT],
      outcomes: ["ok", "error"],
      extensionPoints: ["init"],
      minimumCapabilities: [],
      helperKinds: [],
      defaultPlugins: [],
    };

    registerRecipe(override);
    try {
      const contract = getRecipe(RECIPE_RAG);
      expect(contract.name).toBe(RECIPE_RAG);
      expect(contract.artefactKeys).toEqual([ARTEFACT_ANSWER_TEXT]);
    } finally {
      registerRecipe(original);
    }
  });

  it("marks resumable recipes", () => {
    const resumable = getRecipe("hitl-gate");
    const nonResumable = getRecipe(RECIPE_RAG);

    expect(resumable.supportsResume).toBe(true);
    expect(nonResumable.supportsResume).toBeUndefined();
  });
});
