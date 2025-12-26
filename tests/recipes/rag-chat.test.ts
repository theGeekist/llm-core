import { describe, expect, it } from "bun:test";
import { createHelper } from "@wpkernel/pipeline";
import { ragChat } from "../../src/recipes/rag-chat";
import { assertSyncOutcome } from "../workflow/helpers";

const useHelper = (pipeline: unknown, helper: unknown) => {
  (pipeline as { use: (value: unknown) => void }).use(helper);
};

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

  it("adds system config plugin when system prompt is set", () => {
    const workflow = ragChat({ system: "Prefer concise answers." });
    let seen: string | undefined;
    const readerPlugin = {
      key: "test.read.system",
      helperKinds: ["test.system"],
      register: (pipeline: unknown) => {
        useHelper(
          pipeline,
          createHelper({
            key: "test.read.system",
            kind: "test.system",
            apply: (options) => {
              const ctx = options.context as { system?: string };
              seen = ctx.system;
            },
          }),
        );
      },
    };
    const workflowWithReader = workflow.defaults({ plugins: [readerPlugin] });
    const runtime = workflowWithReader.build();
    const explanation = runtime.explain();

    expect(explanation.plugins).toContain("config.system");
    const outcome = assertSyncOutcome(runtime.run({ input: "question", query: "question" }));
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(seen).toBe("Prefer concise answers.");
  });
});
