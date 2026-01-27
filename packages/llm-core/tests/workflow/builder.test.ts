import { describe, expect, it } from "bun:test";
import { Workflow } from "#workflow";
import type { PipelineWithExtensions, Runtime } from "#workflow/types";
import type { PipelinePauseSnapshot } from "@wpkernel/pipeline/core";
import { getRecipe, registerRecipe } from "#workflow/recipe-registry";
import {
  assertSyncOutcome,
  createResumeSnapshot,
  createTestResumeStore,
  makeWorkflow,
  withFactory,
} from "./helpers";

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

  it("exposes explain() on the builder surface", () => {
    const builder = Workflow.recipe("rag").use({ key: "custom.after" });
    const snapshot = builder.explain();

    expect(snapshot.plugins).toContain("custom.after");
  });

  it("applies runtime defaults when running via the builder", async () => {
    const policy = { maxAttempts: 1, backoffMs: 10 };
    const overrides = { maxAttempts: 2, backoffMs: 5 };
    const pipelineFactory = () =>
      ({
        run: (options: { runtime?: Runtime }) => ({
          artefact: { runtime: options.runtime },
          diagnostics: [],
          steps: [],
        }),
        extensions: { use: () => null },
      }) satisfies PipelineWithExtensions;

    const builder = Workflow.recipe("rag")
      .configure({ pipelineFactory })
      .defaults({ retryDefaults: { model: policy } });
    const outcome = await builder.run(
      { input: "x", query: "x" },
      { retryDefaults: { tools: overrides } },
    );

    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const runtime = (outcome.artefact as { runtime?: Runtime }).runtime;

    expect(runtime?.retryDefaults?.model).toEqual(policy);
    expect(runtime?.retryDefaults?.tools).toEqual(overrides);
  });

  it("wraps resume with handle defaults", () => {
    const original = getRecipe("hitl-gate");
    registerRecipe({
      ...original,
      minimumCapabilities: [],
      defaultPlugins: [],
    });
    try {
      const { store: sessionStore } = createTestResumeStore();
      const token = "token-1";
      const pauseSnapshot: PipelinePauseSnapshot<unknown> = {
        stageIndex: 0,
        state: { userState: { pending: true } },
        token,
        pauseKind: "human",
        createdAt: Date.now(),
      };
      sessionStore.set(token, {
        ...createResumeSnapshot(token, { pending: true }, { pauseKind: "human" }),
        snapshot: pauseSnapshot,
      });

      let capturedRuntime: unknown;
      const pipelineFactory = withFactory(
        () =>
          ({
            run: () => ({ artefact: { ok: true } }),
            resume: (_snapshot: unknown, resumeInput?: unknown) => ({
              artefact: { resumed: resumeInput },
            }),
            extensions: { use: () => undefined },
          }) satisfies PipelineWithExtensions,
      );
      const builder = Workflow.recipe("hitl-gate")
        .configure({ pipelineFactory })
        .defaults({
          resume: {
            sessionStore,
            resolve: (request) => {
              capturedRuntime = request.runtime;
              return { input: request.resumeInput };
            },
          },
        });
      const runtime = builder.build();
      if (!runtime.resume) {
        throw new Error("Expected resume to be available.");
      }

      const outcome = assertSyncOutcome(runtime.resume(token, { decision: "approve" }));
      expect(outcome.status).toBe("ok");
      if (outcome.status !== "ok") {
        throw new Error("Expected ok outcome.");
      }
      expect(outcome.artefact).toEqual({ resumed: { decision: "approve" } });
      expect(
        (capturedRuntime as { resume?: { sessionStore?: unknown } })?.resume?.sessionStore,
      ).toBe(sessionStore);
    } finally {
      registerRecipe(original);
    }
  });
});
