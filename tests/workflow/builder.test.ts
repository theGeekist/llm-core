import { describe, expect, it } from "bun:test";
import { Workflow } from "#workflow";
import { makeWorkflow } from "./helpers";

describe("Workflow builder", () => {
  it("builds a runtime from a known recipe", async () => {
    const runtime = makeWorkflow("agent");
    const outcome = await runtime.run({ input: "hello" });

    expect(outcome.status).toBe("ok");
    expect(outcome.trace).toBeArray();
    expect(outcome.diagnostics).toBeArray();
    expect(runtime.contract().name).toBe("agent");
  });

  it("throws for unknown recipes", () => {
    expect(() => Workflow.recipe("unknown" as never)).toThrow("Unknown recipe");
  });

  it("keeps explain() snapshot deterministic after build", () => {
    let builder = Workflow.recipe("rag");
    builder = builder.use({ key: "custom.after" });
    const runtime = builder.build();

    builder.use({ key: "custom.later" });

    expect(runtime.explain().plugins).toEqual([
      "retriever.vector",
      "retriever.rerank",
      "model.openai",
      "trace.console",
      "custom.after",
    ]);
  });
});
