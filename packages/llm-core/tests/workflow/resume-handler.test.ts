import { describe, expect, it } from "bun:test";
import type { AdapterBundle } from "#adapters";
import type { DiagnosticEntry, TraceEvent } from "#shared/reporting";
import type { Outcome, Runtime } from "#workflow/types";
import { createResumeHandler } from "../../src/workflow/runtime/resume-handler";
import { toResolvedAdapters } from "../../src/workflow/runtime/adapters";
import { diagnosticMessages } from "./helpers";
import type { PauseSession } from "../../src/workflow/driver/types";
import type { PipelinePauseSnapshot } from "@wpkernel/pipeline/core";

const createDeferredResume = () => {
  let release!: () => void;
  const promise = new Promise<{ artefact: { ok: boolean } }>((resolve) => {
    release = () => resolve({ artefact: { ok: true } });
  });
  return { promise, release };
};

describe("Workflow resume handler", () => {
  const baseAdapters: AdapterBundle = { constructs: {} };
  const token = "token-iterator";
  const errorOutcome = (
    error: unknown,
    runtimeTrace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ): Outcome<Record<string, unknown>> => ({
    status: "error",
    error,
    trace: runtimeTrace,
    diagnostics: diagnostics ?? [],
  });
  const finalizeResult = (input: {
    result: unknown;
    getDiagnostics: () => DiagnosticEntry[];
    trace: TraceEvent[];
    diagnosticsMode: "default" | "strict";
  }): Outcome<Record<string, unknown>> => ({
    status: "ok",
    artefact: { value: input.result },
    trace: input.trace,
    diagnostics: input.getDiagnostics(),
  });

  const createPauseSession = (): PauseSession => {
    const snapshot: PipelinePauseSnapshot<unknown> = {
      stageIndex: 0,
      state: {},
      token,
      pauseKind: "human",
      createdAt: Date.now(),
    };
    return {
      snapshot,
      getDiagnostics: () => [],
      createdAt: snapshot.createdAt,
    };
  };

  const createHandler = (input: {
    pauseSessions: Map<unknown, PauseSession>;
    resume: (snapshot: PipelinePauseSnapshot<unknown>, input?: unknown) => unknown;
    readErrorDiagnostics?: (error: unknown) => DiagnosticEntry[];
  }) =>
    createResumeHandler({
      contractName: "agent",
      extensionRegistration: [],
      pipeline: {
        run: () => ({ artefact: { ok: true } }),
        resume: input.resume,
      },
      resolveAdaptersForRun: () => ({
        adapters: baseAdapters,
        diagnostics: [],
        constructs: {},
      }),
      toResolvedAdapters,
      applyAdapterOverrides: (resolved) => resolved,
      readContractDiagnostics: () => [],
      buildDiagnostics: [],
      strictErrorMessage: "strict",
      readErrorDiagnostics: input.readErrorDiagnostics ?? (() => []),
      errorOutcome,
      finalizeResult,
      baseAdapters,
      pauseSessions: input.pauseSessions,
    });

  const runtime = {
    resume: { resolve: () => ({ input: "resume" }) },
  } satisfies Runtime;

  it("consumes an in-memory pause session after a successful resume", async () => {
    const pauseSessions = new Map<unknown, PauseSession>([[token, createPauseSession()]]);
    const handler = createHandler({
      pauseSessions,
      resume: () => ({ artefact: { ok: true } }),
    });

    const outcome = await handler({ token, runtime });

    expect(outcome.status).toBe("ok");
    expect(pauseSessions.has(token)).toBe(false);
  });

  it("keeps a pause session available when resume fails", async () => {
    const pauseSessions = new Map<unknown, PauseSession>([[token, createPauseSession()]]);
    let attempts = 0;
    const handler = createHandler({
      pauseSessions,
      resume: () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("resume failed");
        }
        return { artefact: { ok: true } };
      },
    });

    const first = await handler({ token, runtime });
    expect(first.status).toBe("error");
    expect(pauseSessions.has(token)).toBe(true);

    const second = await handler({ token, runtime });
    expect(second.status).toBe("ok");
    expect(pauseSessions.has(token)).toBe(false);
  });

  it("returns diagnostics when resume adapter resolution throws", async () => {
    const pauseSessions = new Map<unknown, PauseSession>([[token, createPauseSession()]]);
    const handler = createHandler({
      pauseSessions,
      resume: () => ({ artefact: { ok: true } }),
      readErrorDiagnostics: () => [{ level: "warn", kind: "resume", message: "resume error" }],
    });
    const throwingRuntime = {
      resume: {
        resolve: () => {
          throw new Error("adapter boom");
        },
      },
    } satisfies Runtime;

    const outcome = await handler({ token, runtime: throwingRuntime });

    expect(outcome.status).toBe("error");
    expect(diagnosticMessages(outcome.diagnostics)).toContain("resume error");
    expect(pauseSessions.has(token)).toBe(true);
  });

  it("rejects concurrent resumes and releases the claim after completion", async () => {
    const pauseSessions = new Map<unknown, PauseSession>([[token, createPauseSession()]]);
    const deferred = createDeferredResume();
    const handler = createHandler({
      pauseSessions,
      resume: () => deferred.promise,
    });

    const first = handler({ token, runtime });
    const concurrent = await handler({ token, runtime });
    expect(concurrent.status).toBe("error");
    if (concurrent.status === "error") {
      expect(String(concurrent.error)).toContain("already in flight");
    }

    deferred.release();
    expect((await first).status).toBe("ok");
  });
});
