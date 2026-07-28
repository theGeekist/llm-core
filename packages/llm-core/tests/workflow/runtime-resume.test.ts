import { describe, expect, it } from "bun:test";
import { createBuiltinTrace, createInterruptStrategy } from "#adapters";
import { createPipelineRollback, type PipelinePauseSnapshot } from "@wpkernel/pipeline/core";
import { assertSyncOutcome, diagnosticMessages, makeRuntime, makeWorkflow } from "./helpers";

const ERROR_RESUME = "Expected resume to be available.";
const TOKEN = "token-1";

const createPauseSnapshot = (
  token: unknown = TOKEN,
  state: Record<string, unknown> = { userState: { pending: true } },
): PipelinePauseSnapshot<unknown> => ({
  stageIndex: 0,
  state,
  token,
  pauseKind: "human",
  createdAt: Date.now(),
});

const createPausedResult = (snapshot = createPauseSnapshot()) => ({
  __paused: true as const,
  snapshot,
});

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
  it("exposes resume only for recipes that support pause", () => {
    expect(makeWorkflow("hitl-gate").resume).toBeFunction();
    expect(makeWorkflow("rag").resume).toBeUndefined();
  });

  it("returns an error outcome when a live pause has no resume adapter", () => {
    const runtime = makeRuntime("hitl-gate", {
      run: () => createPausedResult(),
      resume: () => ({ artefact: { ok: true } }),
    });
    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    expect(assertSyncOutcome(runtime.run({ input: "gate" })).status).toBe("paused");
    const outcome = assertSyncOutcome(runtime.resume(TOKEN, { answer: "yes" }));

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(String(outcome.error)).toContain("Resume requires a resume adapter.");
    }
  });

  it("returns an error outcome when the process-local token is unknown", () => {
    const runtime = makeWorkflow("hitl-gate");
    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }

    const outcome = assertSyncOutcome(runtime.resume("missing-token"));

    expect(outcome.status).toBe("error");
    expect(diagnosticMessages(outcome.diagnostics)).toContain(
      "Resume token is invalid or expired.",
    );
  });

  it("resolves resume input and rebinds the opaque pipeline snapshot", () => {
    let capturedRequest: Record<string, unknown> | undefined;
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
      run: () => createPausedResult(),
      resume: (_snapshot, resumeInput) => ({ artefact: { resumed: resumeInput } }),
    });
    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }
    expect(assertSyncOutcome(runtime.run({ input: "gate" })).status).toBe("paused");

    const outcome = assertSyncOutcome(
      runtime.resume(
        TOKEN,
        { decision: "approve" },
        {
          resume: {
            resolve: (request) => {
              capturedRequest = request as unknown as Record<string, unknown>;
              return { input: request.resumeInput };
            },
          },
        },
      ),
    );

    expect(outcome).toMatchObject({
      status: "ok",
      artefact: { resumed: { decision: "approve" } },
    });
    expect(capturedRequest).toMatchObject({
      token: TOKEN,
      pauseKind: "human",
      interrupt: { mode: "restart", reason: "test" },
    });
    expect(capturedRequest).not.toHaveProperty("resumeKey");
    expect(capturedRequest).not.toHaveProperty("resumeSnapshot");
  });

  it("supports async resume adapters without normalizing sync pipelines to promises", async () => {
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      run: () => createPausedResult(),
      resume: (_snapshot, resumeInput) => ({ artefact: { resumed: resumeInput } }),
    });
    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }
    expect(assertSyncOutcome(runtime.run({ input: "gate" })).status).toBe("paused");

    const outcome = await runtime.resume(TOKEN, undefined, {
      resume: {
        resolve: async ({ token }) => ({ input: { token } }),
      },
    });

    expect(outcome).toMatchObject({
      status: "ok",
      artefact: { resumed: { token: TOKEN } },
    });
  });

  it("uses runtime diagnostics selected by the resume adapter", () => {
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      plugins: [
        { key: "cap.model", capabilities: { model: { name: "stub" } } },
        { key: "cap.evaluator", capabilities: { evaluator: { name: "stub" } } },
        { key: "cap.hitl", capabilities: { hitl: { adapter: "stub" } } },
      ],
      run: () => createPausedResult(),
      resume: () => ({
        artefact: { ok: true },
        diagnostics: [{ type: "missing-dependency", message: "missing adapter" }],
      }),
    });
    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }
    expect(assertSyncOutcome(runtime.run({ input: "gate" })).status).toBe("paused");

    const outcome = assertSyncOutcome(
      runtime.resume(TOKEN, undefined, {
        resume: {
          resolve: () => ({ input: undefined, runtime: { diagnostics: "strict" } }),
        },
      }),
    );

    expect(outcome.status).toBe("error");
    expect(diagnosticMessages(outcome.diagnostics)).toContain("missing adapter");
  });

  it("derives event streams from trace sinks while rebinding resume context", () => {
    let capturedAdapters: unknown;
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      plugins: [{ key: "adapter.trace", adapters: { trace: createBuiltinTrace() } }],
      run: () => createPausedResult(),
      resume: (snapshot) => {
        capturedAdapters = (snapshot as { state: { context?: { adapters?: unknown } } }).state
          .context?.adapters;
        return { artefact: { ok: true } };
      },
    });
    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }
    expect(assertSyncOutcome(runtime.run({ input: "gate" })).status).toBe("paused");

    const outcome = assertSyncOutcome(
      runtime.resume(TOKEN, undefined, {
        resume: { resolve: ({ token }) => ({ input: { token } }) },
      }),
    );

    expect(outcome.status).toBe("ok");
    expect(capturedAdapters).toMatchObject({
      trace: expect.any(Object),
      eventStream: expect.any(Object),
    });
  });

  it("runs helper rollbacks when a resumed pipeline pauses again", () => {
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
      run: () => createPausedResult(),
      resume: () =>
        createPausedResult(
          createPauseSnapshot("replacement-token", {
            userState: { partial: true },
            steps: fixture.steps,
            helperRollbacks: fixture.state.helperRollbacks,
          }),
        ),
    });
    if (!runtime.resume) {
      throw new Error(ERROR_RESUME);
    }
    expect(assertSyncOutcome(runtime.run({ input: "gate" })).status).toBe("paused");

    const outcome = assertSyncOutcome(
      runtime.resume(TOKEN, undefined, {
        resume: { resolve: ({ token }) => ({ input: { token } }) },
      }),
    );

    expect(outcome.status).toBe("paused");
    expect(rolledBack).toBe(true);
  });
});
