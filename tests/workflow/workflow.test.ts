import { describe, expect, it } from "bun:test";
import { Workflow } from "#workflow";
import { createRuntime } from "#workflow/runtime";
import { getRecipe } from "#workflow/recipe-registry";
import type { Outcome } from "#workflow/types";

describe("Workflow builder/runtime", () => {
  const KEY_MODEL_OPENAI = "model.openai";
  const KEY_RETRIEVER_VECTOR = "retriever.vector";
  const KEY_RETRIEVER_RERANK = "retriever.rerank";
  const ERROR_MISSING_CONTRACT = "Missing recipe contract.";
  const TOKEN_NEEDS_HUMAN = "token-1";
  const isPromiseLike = (value: unknown): value is Promise<unknown> =>
    !!value && typeof (value as Promise<unknown>).then === "function";
  const assertSyncOutcome = (value: Outcome | Promise<Outcome>) => {
    if (isPromiseLike(value)) {
      throw new Error("Expected a synchronous Outcome, got a Promise.");
    }
    return value;
  };

  it("builds a runtime from a known recipe", async () => {
    const runtime = Workflow.recipe("agent").build();
    const outcome = await runtime.run({ input: "hello" });

    expect(outcome.status).toBe("ok");
    expect(outcome.trace).toBeArray();
    expect(outcome.diagnostics).toBeArray();
    expect(runtime.contract().name).toBe("agent");
  });

  it("collects plugin keys for explain()", () => {
    const runtime = Workflow.recipe("rag")
      .use({ key: KEY_MODEL_OPENAI, capabilities: { model: { name: "openai" } } })
      .use({ key: KEY_RETRIEVER_VECTOR, capabilities: { retriever: { type: "vector" } } })
      .build();

    const explain = runtime.explain();
    expect(explain.plugins).toEqual([KEY_MODEL_OPENAI, KEY_RETRIEVER_VECTOR]);
  });

  it("throws for unknown recipes", () => {
    expect(() => Workflow.recipe("unknown" as never)).toThrow("Unknown recipe");
  });

  it("supports sync workflows without requiring await", () => {
    const runtime = Workflow.recipe("agent").build();
    const outcome = runtime.run({ input: "sync-call" });

    const syncOutcome = assertSyncOutcome(outcome);
    expect(syncOutcome.status).toBe("ok");
  });

  it("maps pipeline errors to error outcomes", async () => {
    const contract = getRecipe("agent");
    if (!contract) {
      throw new Error(ERROR_MISSING_CONTRACT);
    }

    const runtime = createRuntime({
      contract,
      plugins: [],
      pipelineFactory: () =>
        ({
          run: () => {
            throw new Error("boom");
          },
        }) as never,
    });

    const outcome = await runtime.run({ input: "fail" });
    expect(outcome.status).toBe("error");
  });

  it("handles sync pipeline success paths with artifacts", () => {
    const contract = getRecipe("rag");
    if (!contract) {
      throw new Error(ERROR_MISSING_CONTRACT);
    }

    const runtime = createRuntime({
      contract,
      plugins: [],
      pipelineFactory: () =>
        ({
          run: () => ({
            artifact: { answer: "sync-ok" },
            diagnostics: ["sync-warn"],
          }),
        }) as never,
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "sync-artifact" }));
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(outcome.artefact).toEqual({ answer: "sync-ok" });
    expect(outcome.diagnostics).toEqual(["sync-warn"]);
  });

  it("handles async pipeline success paths", async () => {
    const contract = getRecipe("rag");
    if (!contract) {
      throw new Error(ERROR_MISSING_CONTRACT);
    }

    const runtime = createRuntime({
      contract,
      plugins: [],
      pipelineFactory: () =>
        ({
          run: () =>
            Promise.resolve({
              artifact: { answer: "ok" },
              diagnostics: ["warn"],
            }),
        }) as never,
    });

    const outcome = await runtime.run({ input: "async" });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(outcome.artefact).toEqual({ answer: "ok" });
    expect(outcome.diagnostics).toEqual(["warn"]);
  });

  it("maps async pipeline failures to error outcomes", async () => {
    const contract = getRecipe("rag");
    if (!contract) {
      throw new Error("Missing recipe contract.");
    }

    const runtime = createRuntime({
      contract,
      plugins: [],
      pipelineFactory: () =>
        ({
          run: () => Promise.reject(new Error("async boom")),
        }) as never,
    });

    const outcome = await runtime.run({ input: "async-fail" });
    expect(outcome.status).toBe("error");
  });

  it("maps needsHuman outcomes with partial artefacts", async () => {
    const contract = getRecipe("hitl-gate");
    if (!contract) {
      throw new Error(ERROR_MISSING_CONTRACT);
    }

    const runtime = createRuntime({
      contract,
      plugins: [],
      pipelineFactory: () =>
        ({
          run: () =>
            Promise.resolve({
              needsHuman: true,
              token: TOKEN_NEEDS_HUMAN,
              artifact: { partial: true },
            }),
        }) as never,
    });

    const outcome = await runtime.run({ input: "gate" });
    expect(outcome.status).toBe("needsHuman");
    if (outcome.status !== "needsHuman") {
      throw new Error("Expected needsHuman outcome.");
    }
    expect(outcome.token).toBe(TOKEN_NEEDS_HUMAN);
    expect(outcome.artefact).toEqual({ partial: true });
  });

  it("keeps explain() snapshot deterministic after build", () => {
    const builder = Workflow.recipe("rag").use({ key: KEY_MODEL_OPENAI });
    const runtime = builder.build();

    builder.use({ key: KEY_RETRIEVER_VECTOR });

    expect(runtime.explain().plugins).toEqual([KEY_MODEL_OPENAI]);
  });

  it("derives capabilities from plugins", () => {
    const runtime = Workflow.recipe("agent")
      .use({ key: KEY_MODEL_OPENAI, capabilities: { model: { name: "openai" } } })
      .use({ key: "tools.web", capabilities: { tools: ["web.search"] } })
      .build();

    expect(runtime.capabilities()).toEqual({
      model: { name: "openai" },
      tools: ["web.search"],
    });
  });

  it("reports missing requirements in explain()", () => {
    const runtime = Workflow.recipe("rag")
      .use({ key: KEY_RETRIEVER_RERANK, requires: ["retriever"] })
      .build();

    expect(runtime.explain().missingRequirements ?? []).toEqual([
      `${KEY_RETRIEVER_RERANK} (requires retriever)`,
    ]);
  });
});
