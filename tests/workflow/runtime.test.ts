import { describe, expect, it } from "bun:test";
import { getRecipe, registerRecipe } from "#workflow/recipe-registry";
import { assertSyncOutcome, diagnosticMessages, makeRuntime, makeWorkflow } from "./helpers";

describe("Workflow runtime", () => {
  const TOKEN_NEEDS_HUMAN = "token-1";

  it("supports sync workflows without requiring await", () => {
    const runtime = makeWorkflow("agent");
    const outcome = runtime.run({ input: "sync-call" });

    const syncOutcome = assertSyncOutcome(outcome);
    expect(syncOutcome.status).toBe("ok");
  });

  it("maps pipeline errors to error outcomes", async () => {
    const runtime = makeRuntime("agent", {
      run: () => {
        throw new Error("boom");
      },
    });

    const outcome = await runtime.run({ input: "fail" });
    expect(outcome.status).toBe("error");
  });

  it("handles sync pipeline success paths with artifacts", () => {
    const runtime = makeRuntime("rag", {
      run: () => ({
        artifact: { answer: "sync-ok" },
        diagnostics: ["sync-warn"],
      }),
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "sync-artifact" }));
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(outcome.artefact).toEqual({ answer: "sync-ok" });
    expect(diagnosticMessages(outcome.diagnostics)).toEqual(["sync-warn"]);
  });

  it("handles async pipeline success paths", async () => {
    const runtime = makeRuntime("rag", {
      run: () =>
        Promise.resolve({
          artifact: { answer: "ok" },
          diagnostics: ["warn"],
        }),
    });

    const outcome = await runtime.run({ input: "async" });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(outcome.artefact).toEqual({ answer: "ok" });
    expect(diagnosticMessages(outcome.diagnostics)).toEqual(["warn"]);
  });

  it("maps async pipeline failures to error outcomes", async () => {
    const runtime = makeRuntime("rag", {
      run: () => Promise.reject(new Error("async boom")),
    });

    const outcome = await runtime.run({ input: "async-fail" });
    expect(outcome.status).toBe("error");
  });

  it("maps needsHuman outcomes with partial artefacts", async () => {
    const runtime = makeRuntime("hitl-gate", {
      run: () =>
        Promise.resolve({
          needsHuman: true,
          token: TOKEN_NEEDS_HUMAN,
          artifact: { partial: true },
        }),
    });

    const outcome = await runtime.run({ input: "gate" });
    expect(outcome.status).toBe("needsHuman");
    if (outcome.status !== "needsHuman") {
      throw new Error("Expected needsHuman outcome.");
    }
    expect(outcome.token).toBe(TOKEN_NEEDS_HUMAN);
    expect(outcome.artefact).toEqual({ partial: true });
  });

  it("passes runtime reporter into pipeline run options", () => {
    const reporter = {
      warn: () => undefined,
    };
    const runtime = makeRuntime("agent", {
      run: (options) => {
        expect(options.reporter).toBe(reporter);
        return { artifact: { ok: true } };
      },
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "reporter" }, { reporter }));
    expect(outcome.status).toBe("ok");
  });

  it("exposes resume only for recipes that support needsHuman", () => {
    const resumable = makeWorkflow("hitl-gate");
    const nonResumable = makeWorkflow("rag");

    expect(resumable.resume).toBeFunction();
    expect(nonResumable.resume).toBeUndefined();
  });

  it("returns a stub error outcome for resume calls", () => {
    const resumable = makeWorkflow("hitl-gate");
    if (!resumable.resume) {
      throw new Error("Expected resume to be available.");
    }

    const outcome = assertSyncOutcome(resumable.resume("token", { answer: "yes" }));
    expect(outcome.status).toBe("error");
    if (outcome.status !== "error") {
      throw new Error("Expected error outcome.");
    }
    expect(String(outcome.error)).toContain("Resume is not implemented.");
  });

  it("uses helper kinds when running the pipeline", async () => {
    const original = getRecipe("agent");
    registerRecipe({
      ...original,
      helperKinds: ["helper.alpha"],
    });
    try {
      const runtime = makeWorkflow("agent");
      const outcome = await runtime.run({ input: "helpers" });

      expect(outcome.status).toBe("ok");
    } finally {
      registerRecipe(original);
    }
  });
});
