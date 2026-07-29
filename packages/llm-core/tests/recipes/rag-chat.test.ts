import { describe, expect, it } from "bun:test";
import type { ModelCall } from "#adapters";
import { recipes } from "../../src/recipes";
import { assertSyncOutcome } from "../workflow/helpers";
import { createMockModel, createMockRetriever } from "../fixtures/factories";

describe("RAG Chat Recipe", () => {
  it("runs the standard retrieval and synthesis flow", () => {
    const workflow = recipes["chat.rag"]().defaults({
      adapters: {
        retriever: createMockRetriever([{ text: "retrieved context" }]),
        model: createMockModel("answer"),
      },
    });
    const stepIds = workflow.explain().steps.map((step) => step.id);
    expect(stepIds).toHaveLength(3);
    expect(stepIds).toEqual(
      expect.arrayContaining([
        "rag-retrieval.seed",
        "rag-retrieval.retrieve",
        "rag-synthesis.synthesize",
      ]),
    );

    const outcome = assertSyncOutcome(workflow.run({ input: "question", query: "question" }));
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect((outcome.artefact as { rag?: { response?: string } }).rag?.response).toBe("answer");
  });

  it("adds system config plugin when system prompt is set", () => {
    const workflow = recipes["chat.rag"]({ system: "Prefer concise answers." });
    let seen: ModelCall | undefined;
    const runtime = workflow
      .defaults({
        adapters: {
          retriever: createMockRetriever([{ text: "retrieved context" }]),
          model: createMockModel((call) => {
            seen = call;
            return { text: "answer" };
          }),
        },
      })
      .build();
    const explanation = runtime.explain();

    expect(explanation.plugins).toContain("config.system");
    const outcome = assertSyncOutcome(runtime.run({ input: "question", query: "question" }));
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(seen?.system).toBe("Prefer concise answers.");
  });
});
