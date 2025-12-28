import { describe, expect, it } from "bun:test";
import type { Model, Retriever } from "../../../src/adapters/types";
import { RagRetrievalPack } from "../../../src/recipes/rag/retrieval";
import { RagSynthesisPack, createRagSynthesisRecipe } from "../../../src/recipes/rag/synthesis";
import { Recipe } from "../../../src/recipes/flow";
import { assertSyncOutcome } from "../../workflow/helpers";

describe("RAG synthesis pack", () => {
  it("uses the model to synthesize a response", () => {
    const retriever: Retriever = {
      retrieve: () => ({ documents: [{ text: "doc-a" }] }),
    };
    const model: Model = {
      generate: () => ({ text: "answer" }),
    };
    const runtime = Recipe.flow("rag")
      .use(RagRetrievalPack)
      .use(RagSynthesisPack)
      .defaults({ adapters: { retriever, model } })
      .build();
    const outcome = assertSyncOutcome(runtime.run({ input: "question", query: "question" }));

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const rag = (outcome.artefact as { rag?: { response?: string } }).rag;
    expect(rag?.response).toBe("answer");
  });

  it("skips synthesis when the model returns null", () => {
    const retriever: Retriever = {
      retrieve: () => ({ documents: [{ text: "doc-a" }] }),
    };
    const model: Model = {
      generate: () => ({}),
    };
    const runtime = Recipe.flow("rag")
      .use(RagRetrievalPack)
      .use(RagSynthesisPack)
      .defaults({ adapters: { retriever, model } })
      .build();
    const outcome = assertSyncOutcome(runtime.run({ input: "question", query: "question" }));

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const rag = (outcome.artefact as { rag?: { response?: string } }).rag;
    expect(rag?.response).toBeUndefined();
  });

  it("plans synthesis recipes with config defaults", () => {
    const recipe = createRagSynthesisRecipe({ defaults: { adapters: {} } });
    const plan = recipe.plan();

    expect(plan.steps.length).toBe(1);
  });
});
