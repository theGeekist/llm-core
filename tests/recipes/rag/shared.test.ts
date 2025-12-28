import { describe, expect, it } from "bun:test";
import type { Model, Retriever, Reranker } from "../../../src/adapters/types";
import { RagStateHelpers } from "../../../src/recipes/rag/shared";

describe("RAG state helpers", () => {
  it("builds prompts with documents when available", () => {
    const rag = RagStateHelpers.readRagState({});
    RagStateHelpers.setRagInput(rag, { input: "question" });
    rag.documents = [{ text: "doc-a" }, { text: "doc-b" }];

    const prompt = RagStateHelpers.buildPrompt(rag);
    expect(prompt).toContain("question");
    expect(prompt).toContain("Context:");
  });

  it("returns null when retriever is missing", () => {
    const rag = RagStateHelpers.readRagState({});
    const result = RagStateHelpers.runRetrieve(undefined, "query", rag, undefined);

    expect(result).toBeNull();
  });

  it("applies reranker results when provided", () => {
    const rag = RagStateHelpers.readRagState({});
    const retriever: Retriever = {
      retrieve: () => ({ documents: [{ text: "doc-a" }, { text: "doc-b" }] }),
    };
    const reranker: Reranker = {
      rerank: (_query, documents) => [documents[0]!],
    };
    const result = RagStateHelpers.runRetrieve(retriever, "query", rag, reranker);

    expect(result).toBeDefined();
    expect(rag.documents?.length).toBe(1);
  });

  it("runs the model when available", () => {
    const model: Model = { generate: () => ({ text: "answer" }) };
    const result = RagStateHelpers.runModel(model, "prompt");

    expect(result).toEqual({ text: "answer" });
  });
});
