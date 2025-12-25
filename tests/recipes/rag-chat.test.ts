import { describe, expect, it } from "bun:test";
import { ragChat } from "../../src/recipes/rag-chat";

describe("RAG Chat Recipe", () => {
  it("builds a workflow with default configuration", () => {
    const workflow = ragChat();
    const runtime = workflow.build();
    expect(runtime).toBeDefined();
  });

  it("configures providers", () => {
    const workflow = ragChat({
      model: "test-model",
      retriever: "test-retriever",
    });
    const runtime = workflow.build();
    const explanation = runtime.explain();
    expect(explanation).toBeDefined();
  });

  it("configures system prompt", () => {
    const workflow = ragChat({ system: "System prompt" });
    const runtime = workflow.build();
    const explanation = runtime.explain();
    expect(explanation).toBeDefined();
  });
});
