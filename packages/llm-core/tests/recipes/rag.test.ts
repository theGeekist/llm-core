import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../workflow/helpers";
import { createMockModel, createMockRetriever } from "../fixtures/factories";
import { recipes } from "../../src/recipes";

describe("Rag recipe", () => {
  it("retrieves documents and synthesizes a response", () => {
    const retriever = createMockRetriever();
    const model = createMockModel((call) => ({
      text: `answer:${(call as { prompt?: string }).prompt ?? ""}`,
    }));
    const runtime = recipes.rag().defaults({ adapters: { retriever, model } }).build();
    const outcome = assertSyncOutcome(runtime.run({ input: "query" }));

    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const rag = (outcome.artefact as { rag?: { response?: string } }).rag;
    expect(rag?.response).toContain("answer:");
  });
});
