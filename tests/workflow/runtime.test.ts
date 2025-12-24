import { describe, expect, it } from "bun:test";
import { createBuiltinRetriever } from "#adapters";
import { getRecipe, registerRecipe } from "#workflow/recipe-registry";
import {
  assertSyncOutcome,
  createResumeSnapshot,
  createSessionStore,
  diagnosticMessages,
  makeRuntime,
  makeWorkflow,
} from "./helpers";

describe("Workflow runtime", () => {
  const TOKEN_PAUSED = "token-1";
  const ERROR_RESUME = "Expected resume to be available.";
  const ERROR_EXPECTED_OK = "Expected ok outcome.";
  const ERROR_EXPECTED_PAUSED = "Expected paused outcome.";
  type ResumeDecision = { decision: "approve" | "deny" };
  type PauseYield = {
    paused: true;
    token: string;
    pauseKind?: "human" | "external" | "system";
    partialArtifact?: Record<string, unknown>;
  };

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
      throw new Error(ERROR_EXPECTED_OK);
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
      throw new Error(ERROR_EXPECTED_OK);
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

  it("maps paused outcomes with partial artefacts", async () => {
    const runtime = makeRuntime("hitl-gate", {
      run: () =>
        Promise.resolve({
          paused: true,
          token: TOKEN_PAUSED,
          artifact: { partial: true },
        }),
    });

    const outcome = await runtime.run({ input: "gate" });
    expect(outcome.status).toBe("paused");
    if (outcome.status !== "paused") {
      throw new Error(ERROR_EXPECTED_PAUSED);
    }
    expect(outcome.token).toBe(TOKEN_PAUSED);
    expect(outcome.artefact).toEqual({ partial: true });
  });

  it("supports generator pauses and resumes with pauseKind", async () => {
    let capturedPauseKind: unknown;
    function* pauseSequence(): Generator<
      PauseYield,
      { artifact: { resumed: ResumeDecision } },
      ResumeDecision
    > {
      const resumeValue = yield {
        paused: true,
        token: TOKEN_PAUSED,
        pauseKind: "external",
        partialArtifact: { pending: true },
      };
      return { artifact: { resumed: resumeValue } };
    }

    const runtime = makeRuntime("hitl-gate", {
      run: () => pauseSequence(),
    });

    const paused = await runtime.run({ input: "gate" });
    expect(paused.status).toBe("paused");
    if (paused.status !== "paused") {
      throw new Error(ERROR_EXPECTED_PAUSED);
    }
    const pausedTrace = (
      paused.trace as Array<{ kind: string; data?: Record<string, unknown> }>
    ).find((event) => event.kind === "run.paused");
    expect(pausedTrace?.data).toMatchObject({ pauseKind: "external" });

    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    const resumed = await runtime.resume(
      TOKEN_PAUSED,
      { decision: "approve" },
      {
        resume: {
          resolve: (request) => {
            capturedPauseKind = request.pauseKind;
            return { input: request.resumeInput };
          },
        },
      },
    );

    expect(capturedPauseKind).toBe("external");
    expect(resumed.status).toBe("ok");
    if (resumed.status !== "ok") {
      throw new Error(ERROR_EXPECTED_OK);
    }
    expect(resumed.artefact).toEqual({ resumed: { decision: "approve" } });
  });

  it("supports async generator pauses during resume", async () => {
    const token = "token-async";
    async function* pauseSequence(): AsyncGenerator<
      { paused: true; token: string },
      { artifact: { resumed: ResumeDecision } },
      ResumeDecision
    > {
      const resumeValue = yield {
        paused: true,
        token,
      };
      return { artifact: { resumed: resumeValue } };
    }

    const runtime = makeRuntime("hitl-gate", {
      run: () => pauseSequence(),
    });

    const paused = await runtime.run({ input: "gate" });
    expect(paused.status).toBe("paused");
    if (paused.status !== "paused") {
      throw new Error(ERROR_EXPECTED_PAUSED);
    }

    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    const resumed = await runtime.resume(
      token,
      { decision: "deny" },
      {
        resume: {
          resolve: (request) => ({ input: request.resumeInput }),
        },
      },
    );

    expect(resumed.status).toBe("ok");
    if (resumed.status !== "ok") {
      throw new Error(ERROR_EXPECTED_OK);
    }
    expect(resumed.artefact).toEqual({ resumed: { decision: "deny" } });
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

  it("reports adapter input diagnostics during runs", () => {
    const retriever = createBuiltinRetriever();
    const runtime = makeRuntime("rag", {
      includeDefaults: false,
      plugins: [{ key: "adapter.retriever", adapters: { retriever } }],
      run: (options) => {
        const adapters = options.adapters as { retriever?: typeof retriever };
        adapters.retriever?.retrieve(" ");
        return { artifact: { ok: true } };
      },
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "query" }));
    expect(outcome.status).toBe("ok");
    expect(diagnosticMessages(outcome.diagnostics)).toContain("retriever_query_missing");
  });

  it("reports adapter input diagnostics during generator pauses", async () => {
    const retriever = createBuiltinRetriever();
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      plugins: [{ key: "adapter.retriever", adapters: { retriever } }],
      run: (options) => {
        const adapters = options.adapters as { retriever?: typeof retriever };
        function* pauseWithDiagnostics(): Generator<
          PauseYield,
          { artifact: { ok: true } },
          unknown
        > {
          adapters.retriever?.retrieve(" ");
          yield { paused: true, token: TOKEN_PAUSED };
          return { artifact: { ok: true } };
        }
        return pauseWithDiagnostics();
      },
    });

    const outcome = await runtime.run({ input: "query" });
    expect(outcome.status).toBe("paused");
    if (outcome.status !== "paused") {
      throw new Error(ERROR_EXPECTED_PAUSED);
    }
    expect(diagnosticMessages(outcome.diagnostics)).toContain("retriever_query_missing");
  });

  it("exposes resume only for recipes that support paused", () => {
    const resumable = makeWorkflow("hitl-gate");
    const nonResumable = makeWorkflow("rag");

    expect(resumable.resume).toBeFunction();
    expect(nonResumable.resume).toBeUndefined();
  });

  it("returns an error outcome when resume has no adapter", () => {
    const resumable = makeRuntime("hitl-gate", {
      run: () => {
        function* pauseSequence(): Generator<PauseYield, { artifact: { ok: true } }, unknown> {
          yield { paused: true, token: TOKEN_PAUSED };
          return { artifact: { ok: true } };
        }
        return pauseSequence();
      },
    });
    if (!resumable.resume) {
      throw new Error(ERROR_RESUME);
    }

    const paused = assertSyncOutcome(resumable.run({ input: "gate" }));
    expect(paused.status).toBe("paused");

    const outcome = assertSyncOutcome(resumable.resume(TOKEN_PAUSED, { answer: "yes" }));
    expect(outcome.status).toBe("error");
    if (outcome.status !== "error") {
      throw new Error("Expected error outcome.");
    }
    expect(String(outcome.error)).toContain("Resume requires a resume adapter.");
  });

  it("returns an error outcome when resume token is invalid", () => {
    const resumable = makeWorkflow("hitl-gate");
    if (!resumable.resume) {
      throw new Error(ERROR_RESUME);
    }

    const outcome = assertSyncOutcome(resumable.resume("missing-token"));
    expect(outcome.status).toBe("error");
    if (outcome.status !== "error") {
      throw new Error("Expected error outcome.");
    }
    expect(diagnosticMessages(outcome.diagnostics)).toContain(
      "Resume token is invalid or expired.",
    );
  });

  it("uses the resume adapter to resume runs", () => {
    let captured: unknown;
    const { sessionStore } = createSessionStore();
    sessionStore.set(
      "token-1",
      createResumeSnapshot("token-1", { pending: true }, { pauseKind: "human" }),
    );
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      plugins: [
        {
          key: "adapter.tools",
          adapters: {
            tools: [{ name: "search" }],
          },
        },
      ],
      run: (options) => {
        captured = options;
        return { artifact: { ok: true } };
      },
    });

    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    const outcome = assertSyncOutcome(
      runtime.resume(
        "token-1",
        { decision: "approve" },
        {
          resume: {
            sessionStore,
            resolve: ({ token, resumeInput }) => ({
              input: { token, resumeInput },
            }),
          },
        },
      ),
    );

    expect(outcome.status).toBe("ok");
    expect(captured).toMatchObject({
      input: { token: "token-1", resumeInput: { decision: "approve" } },
      adapters: { tools: [{ name: "search" }] },
    });
  });

  it("supports async resume adapters during resume", async () => {
    let captured: unknown;
    const { sessionStore } = createSessionStore();
    sessionStore.set("token-2", createResumeSnapshot("token-2"));
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      run: (options) => {
        captured = options;
        return { artifact: { ok: true } };
      },
    });

    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    const outcome = await runtime.resume("token-2", undefined, {
      resume: {
        sessionStore,
        resolve: async ({ token }) => ({ input: { token } }),
      },
    });

    expect(outcome.status).toBe("ok");
    expect(captured).toMatchObject({ input: { token: "token-2" } });
  });

  it("uses the resume runtime diagnostics mode", () => {
    const { sessionStore } = createSessionStore();
    sessionStore.set("token-4", createResumeSnapshot("token-4"));
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      plugins: [
        { key: "cap.model", capabilities: { model: { name: "stub" } } },
        { key: "cap.evaluator", capabilities: { evaluator: { name: "stub" } } },
        { key: "cap.hitl", capabilities: { hitl: { adapter: "stub" } } },
      ],
      run: () => ({
        artifact: { ok: true },
        diagnostics: [{ type: "missing-dependency", message: "missing adapter" }],
      }),
    });

    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    const outcome = assertSyncOutcome(
      runtime.resume("token-4", undefined, {
        resume: {
          sessionStore,
          resolve: () => ({ input: { token: "token-4" }, runtime: { diagnostics: "strict" } }),
        },
      }),
    );

    expect(outcome.status).toBe("error");
    expect(diagnosticMessages(outcome.diagnostics)).toContain("missing adapter");
  });

  it("treats resume envelopes with extra keys as input", () => {
    let captured: unknown;
    const { sessionStore } = createSessionStore();
    sessionStore.set("token-5", createResumeSnapshot("token-5"));
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      run: (options) => {
        captured = options.input;
        return { artifact: { ok: true } };
      },
    });

    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    const resumeInput = { input: { token: "token-5" }, extra: "keep" };
    const outcome = assertSyncOutcome(
      runtime.resume("token-5", undefined, {
        resume: {
          sessionStore,
          resolve: () => resumeInput,
        },
      }),
    );

    expect(outcome.status).toBe("ok");
    expect(captured).toEqual(resumeInput);
    expect(diagnosticMessages(outcome.diagnostics)).toContain(
      "Resume adapter returned an object with extra keys; treating it as input.",
    );
  });

  it("warns when resume adapter returns an object without input", () => {
    const { sessionStore } = createSessionStore();
    sessionStore.set("token-3", createResumeSnapshot("token-3"));
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      run: () => ({ artifact: { ok: true } }),
    });

    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    const outcome = assertSyncOutcome(
      runtime.resume("token-3", undefined, {
        resume: {
          sessionStore,
          resolve: () => ({ runtime: { diagnostics: "default" } }),
        },
      }),
    );

    expect(outcome.status).toBe("ok");
    expect(diagnosticMessages(outcome.diagnostics)).toContain(
      "Resume adapter returned an object without an input; treating it as input.",
    );
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

  it("exposes adapter bundles from plugins", () => {
    const model = { generate: () => ({ text: "ok" }) };
    const runtime = makeWorkflow(
      "agent",
      [
        {
          key: "adapter.docs",
          adapters: {
            documents: [{ text: "doc-1" }],
          },
        },
        {
          key: "adapter.tools",
          adapters: {
            tools: [{ name: "search" }],
          },
        },
        {
          key: "adapter.model",
          adapters: {
            model,
          },
        },
      ],
      { includeDefaults: false },
    );

    const adapters = runtime.declaredAdapters();
    expect(adapters.documents).toEqual([{ text: "doc-1" }]);
    expect(adapters.tools).toEqual([{ name: "search" }]);
    expect(adapters.model).toBe(model);
  });

  it("honors override semantics for adapter bundles", () => {
    const runtime = makeWorkflow(
      "agent",
      [
        {
          key: "adapter.base",
          adapters: {
            documents: [{ text: "doc-1" }],
            tools: [{ name: "search" }],
          },
        },
        {
          key: "adapter.override",
          mode: "override",
          overrideKey: "adapter.base",
          adapters: {
            documents: [{ text: "doc-2" }],
          },
        },
      ],
      { includeDefaults: false },
    );

    const adapters = runtime.declaredAdapters();
    expect(adapters.documents).toEqual([{ text: "doc-2" }]);
    expect(adapters.tools).toBeUndefined();
  });
});
