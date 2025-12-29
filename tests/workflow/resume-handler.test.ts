import { describe, expect, it } from "bun:test";
import type { AdapterBundle } from "#adapters";
import type { DiagnosticEntry } from "#workflow/diagnostics";
import type { TraceEvent } from "#workflow/trace";
import type { Outcome, Runtime } from "#workflow/types";
import { createResumeHandler } from "../../src/workflow/runtime/resume-handler";
import { toResolvedAdapters } from "../../src/workflow/runtime/adapters";
import { createResumeSnapshot, diagnosticMessages } from "./helpers";
import type { PauseSession } from "../../src/workflow/driver/types";
import type { PipelinePauseSnapshot } from "@wpkernel/pipeline/core";

describe("Workflow resume handler", () => {
  const baseAdapters: AdapterBundle = { constructs: {} };
  const tokenIterator = "token-iterator";
  const tokenSnapshot = "token-snapshot";
  const readErrorDiagnostics = () => [] as DiagnosticEntry[];
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
  const finalizeResult = (
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    runtimeTrace: TraceEvent[],
    mode: "default" | "strict",
    recordSnapshot?: (value: unknown) => unknown,
  ): Outcome<Record<string, unknown>> => {
    void mode;
    void recordSnapshot;
    return {
      status: "ok",
      artefact: { value: result },
      trace: runtimeTrace,
      diagnostics: getDiagnostics(),
    };
  };

  const createPauseSession = (token: string): PauseSession => {
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
      createdAt: Date.now(),
    };
  };

  it("continues pause sessions through store deletes", async () => {
    const pauseSessions = new Map<unknown, PauseSession>();
    pauseSessions.set(tokenIterator, createPauseSession(tokenIterator));
    let deleted = false;
    const runtime = {
      resume: {
        resolve: () => ({ input: "resume" }),
        sessionStore: {
          get: () => undefined,
          set: () => undefined,
          delete: () => {
            deleted = true;
          },
        },
      },
    } satisfies Runtime;

    const handler = createResumeHandler({
      contractName: "agent",
      extensionRegistration: [],
      pipeline: {
        run: () => ({ artifact: { ok: true } }),
        resume: () => ({ artifact: { ok: true } }),
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
      readErrorDiagnostics,
      errorOutcome,
      finalizeResult,
      baseAdapters,
      pauseSessions,
    });

    const outcome = await handler(tokenIterator, undefined, runtime);
    expect(outcome.status).toBe("ok");
    expect(deleted).toBe(true);
  });

  it("returns diagnostics when resume handling throws", async () => {
    const pauseSessions = new Map<unknown, PauseSession>();
    const runtime = {
      resume: {
        resolve: () => ({ input: "resume" }),
        sessionStore: {
          get: () => {
            throw new Error("store boom");
          },
          set: () => undefined,
          delete: () => undefined,
        },
      },
    } satisfies Runtime;

    const readErrorDiagnostics = () =>
      [{ level: "warn", kind: "resume", message: "resume error" }] as DiagnosticEntry[];

    const handler = createResumeHandler({
      contractName: "agent",
      extensionRegistration: [],
      pipeline: {
        run: () => ({ artifact: { ok: true } }),
        resume: () => ({ artifact: { ok: true } }),
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
      readErrorDiagnostics,
      errorOutcome,
      finalizeResult,
      baseAdapters,
      pauseSessions,
    });

    const outcome = await handler("token-boom", undefined, runtime);
    expect(outcome.status).toBe("error");
    expect(diagnosticMessages(outcome.diagnostics)).toContain("resume error");
  });

  it("ignores provider overrides for pause resumes", async () => {
    const pauseSessions = new Map<unknown, PauseSession>();
    pauseSessions.set(tokenIterator, createPauseSession(tokenIterator));
    let resolveCalls = 0;
    const runtime = {
      resume: {
        resolve: () => ({ input: "resume", providers: { model: "override" } }),
      },
    } satisfies Runtime;

    const handler = createResumeHandler({
      contractName: "agent",
      extensionRegistration: [],
      pipeline: {
        run: () => ({ artifact: { ok: true } }),
        resume: () => ({ artifact: { ok: true } }),
      },
      resolveAdaptersForRun: () => {
        resolveCalls += 1;
        return {
          adapters: baseAdapters,
          diagnostics: [],
          constructs: {},
        };
      },
      toResolvedAdapters,
      applyAdapterOverrides: (resolved) => resolved,
      readContractDiagnostics: () => [],
      buildDiagnostics: [],
      strictErrorMessage: "strict",
      readErrorDiagnostics,
      errorOutcome,
      finalizeResult,
      baseAdapters,
      pauseSessions,
    });

    const outcome = await handler(tokenIterator, undefined, runtime);
    expect(outcome.status).toBe("ok");
    expect(resolveCalls).toBe(1);
  });

  it("uses resume error handling when store deletes fail", async () => {
    const pauseSessions = new Map<unknown, PauseSession>();
    const runtime = {
      resume: {
        resolve: () => ({ input: "resume" }),
        sessionStore: {
          get: () => createResumeSnapshot(tokenSnapshot, { step: 1 }),
          set: () => undefined,
          delete: () => {
            throw new Error("delete failed");
          },
        },
      },
    } satisfies Runtime;

    const handler = createResumeHandler({
      contractName: "agent",
      extensionRegistration: [],
      pipeline: {
        run: () => ({ artifact: { ok: true } }),
        resume: () => ({ artifact: { ok: true } }),
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
      readErrorDiagnostics,
      errorOutcome,
      finalizeResult,
      baseAdapters,
      pauseSessions,
    });

    const outcome = await handler(tokenSnapshot, undefined, runtime);
    expect(outcome.status).toBe("error");
  });

  it("does not delete sessions when resume outcomes are errors", async () => {
    const pauseSessions = new Map<unknown, PauseSession>();
    let deleted = false;
    const runtime = {
      resume: {
        resolve: () => ({ input: "resume" }),
        sessionStore: {
          get: () => createResumeSnapshot(tokenSnapshot, { step: 1 }),
          set: () => undefined,
          delete: () => {
            deleted = true;
          },
        },
      },
    } satisfies Runtime;

    const handler = createResumeHandler({
      contractName: "agent",
      extensionRegistration: [],
      pipeline: {
        run: () => ({ artifact: { ok: true } }),
        resume: () => ({ artifact: { ok: true } }),
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
      readErrorDiagnostics,
      errorOutcome,
      finalizeResult: (result, getDiagnostics, runtimeTrace, mode, recordSnapshot) => {
        void result;
        void getDiagnostics;
        void mode;
        void recordSnapshot;
        return {
          status: "error",
          error: new Error("resume failed"),
          trace: runtimeTrace,
          diagnostics: [],
        };
      },
      baseAdapters,
      pauseSessions,
    });

    const outcome = await handler(tokenSnapshot, undefined, runtime);
    expect(outcome.status).toBe("error");
    expect(deleted).toBe(false);
  });

  it("returns paused outcomes when resume yields paused", async () => {
    const pauseSessions = new Map<unknown, PauseSession>();
    pauseSessions.set(tokenIterator, createPauseSession(tokenIterator));
    let deleted = false;
    const runtime = {
      resume: {
        resolve: () => ({ input: "resume" }),
        sessionStore: {
          get: () => undefined,
          set: () => undefined,
          delete: () => {
            deleted = true;
          },
        },
      },
    } satisfies Runtime;

    const handler = createResumeHandler({
      contractName: "agent",
      extensionRegistration: [],
      pipeline: {
        run: () => ({ artifact: { ok: true } }),
        resume: () => ({
          __paused: true,
          snapshot: {
            stageIndex: 0,
            state: {},
            token: "paused",
            pauseKind: "human",
            createdAt: Date.now(),
          },
        }),
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
      readErrorDiagnostics,
      errorOutcome,
      finalizeResult: (result, getDiagnostics, runtimeTrace, mode, recordSnapshot) => {
        void mode;
        void recordSnapshot;
        const diagnostics = getDiagnostics();
        return (result as { __paused?: boolean }).__paused
          ? {
              status: "paused",
              token: (result as { snapshot?: { token?: unknown } }).snapshot?.token,
              artefact: {},
              trace: runtimeTrace,
              diagnostics,
            }
          : {
              status: "ok",
              artefact: { value: result },
              trace: runtimeTrace,
              diagnostics,
            };
      },
      baseAdapters,
      pauseSessions,
    });

    const outcome = await handler(tokenIterator, undefined, runtime);
    expect(outcome.status).toBe("paused");
    expect(deleted).toBe(false);
  });
});
