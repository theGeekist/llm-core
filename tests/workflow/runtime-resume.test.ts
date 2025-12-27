import { describe, expect, it } from "bun:test";
import { createBuiltinTrace, createInterruptStrategy } from "#adapters";
import {
  assertSyncOutcome,
  createResumeSnapshot,
  createSessionStore,
  diagnosticMessages,
  makeRuntime,
  makeWorkflow,
} from "./helpers";

const ERROR_RESUME = "Expected resume to be available.";

type PauseYield = {
  paused: true;
  token: string;
  pauseKind?: "human" | "external" | "system";
  partialArtifact?: Record<string, unknown>;
};

describe("Workflow runtime resume", () => {
  const TOKEN_PAUSED = "token-1";

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
            interrupt: createInterruptStrategy("restart", "test"),
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
            resolve: ({ token, resumeInput, interrupt }) => ({
              input: { token, resumeInput, interrupt },
            }),
          },
        },
      ),
    );

    expect(outcome.status).toBe("ok");
    expect(captured).toMatchObject({
      input: {
        token: "token-1",
        resumeInput: { decision: "approve" },
        interrupt: { mode: "restart", reason: "test" },
      },
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

  it("derives event streams from trace sinks during resume", () => {
    let captured: unknown;
    const { sessionStore } = createSessionStore();
    sessionStore.set("token-6", createResumeSnapshot("token-6"));
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      plugins: [
        {
          key: "adapter.trace",
          adapters: {
            trace: createBuiltinTrace(),
          },
        },
      ],
      run: (options) => {
        captured = options.adapters;
        return { artifact: { ok: true } };
      },
    });

    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    const outcome = assertSyncOutcome(
      runtime.resume("token-6", undefined, {
        resume: {
          sessionStore,
          resolve: ({ token }) => ({ input: { token } }),
        },
      }),
    );

    expect(outcome.status).toBe("ok");
    expect(captured).toMatchObject({
      trace: expect.any(Object),
      eventStream: expect.any(Object),
    });
  });
});
