import { describe, expect, it } from "bun:test";
import type { Retriever, Reranker } from "../../../src/adapters/types";
import { recipes } from "../../../src/recipes";
import { assertSyncOutcome } from "../../workflow/helpers";

describe("RAG retrieval recipe", () => {
  it("retrieves and reranks documents", () => {
    const retriever: Retriever = {
      retrieve: () => ({ documents: [{ text: "doc-a" }, { text: "doc-b" }] }),
    };
    const reranker: Reranker = {
      rerank: (_query, documents) => [documents[0]!],
    };
    const runtime = recipes["rag.retrieval"]().defaults({
      adapters: { retriever, reranker },
    });
    const outcome = assertSyncOutcome(runtime.run({ input: "question", query: "question" }));

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect((outcome.artefact as { rag?: unknown }).rag).toBeDefined();
  });
});
