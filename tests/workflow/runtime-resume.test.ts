import { describe, expect, it } from "bun:test";
import { createBuiltinTrace, createInterruptStrategy } from "#adapters";
import { createPipelineRollback, type PipelinePauseSnapshot } from "@wpkernel/pipeline/core";
import {
  assertSyncOutcome,
  createResumeSnapshot,
  createSessionStore,
  diagnosticMessages,
  makeRuntime,
  makeWorkflow,
} from "./helpers";

const ERROR_RESUME = "Expected resume to be available.";

const createRollbackFixture = (onRollback: () => void) => {
  const rollback = createPipelineRollback(onRollback);
  const rollbacks = new Map([
    [
      "recipe.steps",
      [
        {
          helper: { key: "step.pause" },
          rollback,
        },
      ],
    ],
  ]);
  return {
    state: { helperRollbacks: rollbacks },
    steps: [
      {
        id: "step.pause",
        index: 0,
        key: "step.pause",
        kind: "recipe.steps",
        mode: "extend",
        priority: 0,
        dependsOn: [],
      },
    ],
  };
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
      run: () => ({
        __paused: true,
        snapshot: {
          stageIndex: 0,
          state: { userState: { ok: true } },
          token: TOKEN_PAUSED,
          pauseKind: "human",
          createdAt: Date.now(),
        } satisfies PipelinePauseSnapshot<unknown>,
      }),
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
    let capturedRequest: unknown;
    const { sessionStore } = createSessionStore();
    const pauseSnapshot: PipelinePauseSnapshot<unknown> = {
      stageIndex: 0,
      state: { userState: { pending: true } },
      token: "token-1",
      pauseKind: "human",
      createdAt: Date.now(),
    };
    sessionStore.set("token-1", {
      ...createResumeSnapshot("token-1", { pending: true }, { pauseKind: "human" }),
      snapshot: pauseSnapshot,
    });
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
      run: () => ({ artifact: { ok: true } }),
      resume: (_snapshot, resumeInput) => ({ artifact: { resumed: resumeInput } }),
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
            resolve: (request) => {
              capturedRequest = request;
              return { input: request.resumeInput };
            },
          },
        },
      ),
    );

    expect(outcome.status).toBe("ok");
    expect(capturedRequest).toMatchObject({
      token: "token-1",
      pauseKind: "human",
      interrupt: { mode: "restart", reason: "test" },
    });
    expect(outcome).toMatchObject({
      status: "ok",
      artefact: { resumed: { decision: "approve" } },
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

  it("runs helper rollbacks when a resumed pipeline pauses", () => {
    const token = "token-rollback";
    const { sessionStore } = createSessionStore();
    sessionStore.set(token, createResumeSnapshot(token));
    let rolledBack = false;
    const fixture = createRollbackFixture(() => {
      rolledBack = true;
    });
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      plugins: [
        {
          key: "adapter.interrupt",
          adapters: { interrupt: createInterruptStrategy("restart") },
        },
      ],
      run: () => ({
        paused: true,
        token,
        artifact: { partial: true },
        ...fixture,
      }),
    });

    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    const outcome = assertSyncOutcome(
      runtime.resume(token, undefined, {
        resume: {
          sessionStore,
          resolve: ({ token: resumeToken }) => ({ input: { token: resumeToken } }),
        },
      }),
    );

    expect(outcome.status).toBe("paused");
    expect(rolledBack).toBe(true);
  });
});
