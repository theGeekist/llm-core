import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../workflow/helpers";
import type { Model, Retriever } from "../../src/adapters/types";
import { recipes } from "../../src/recipes";

const createRetriever = (): Retriever => ({
  retrieve: (query) => ({
    query,
    documents: [{ text: "doc-one" }, { text: "doc-two" }],
  }),
});

const createModel = (): Model => ({
  generate: (call) => ({ text: `answer:${call.prompt ?? ""}` }),
});

describe("Rag recipe", () => {
  it("retrieves documents and synthesizes a response", () => {
    const retriever = createRetriever();
    const model = createModel();
    const runtime = recipes.rag().defaults({ adapters: { retriever, model } }).build();
    const outcome = assertSyncOutcome(runtime.run({ input: "query" }));

    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const rag = (outcome.artefact as { rag?: { response?: string } }).rag;
    expect(rag?.response).toContain("answer:");
  });
});
