import { describe, expect, it } from "bun:test";
import type { AdapterBundle } from "#adapters";
import type { DiagnosticEntry } from "#workflow/diagnostics";
import type { DriveIteratorInput } from "#workflow/driver/iterator";
import type { ExecutionIterator } from "#workflow/driver/types";
import type { TraceEvent } from "#workflow/trace";
import type { Outcome } from "#workflow/types";
import { runWorkflow, type RunWorkflowDeps } from "#workflow/runtime/run-runner";

describe("Workflow run runner", () => {
  it("reports invalid iterator yields as errors", async () => {
    const readDiagnosticCode = (value: unknown) => {
      if (!value || typeof value !== "object") {
        return undefined;
      }
      const typed = value as { data?: { code?: string } };
      return typed.data?.code;
    };
    const deps: RunWorkflowDeps<Outcome> = {
      pipeline: {
        run: () => ({
          next: () => ({ done: false, value: { paused: false } }),
        }),
      },
      extensionRegistration: [],
      resolveAdaptersForRun: () => ({
        adapters: { constructs: {} } as AdapterBundle,
        diagnostics: [],
        constructs: {},
      }),
      toResolvedAdapters: (resolution: {
        adapters: AdapterBundle;
        constructs: Record<string, unknown>;
      }) => resolution.adapters,
      readContractDiagnostics: () => [] as DiagnosticEntry[],
      buildDiagnostics: [] as DiagnosticEntry[],
      strictErrorMessage: "strict",
      toErrorOutcome: (
        error: unknown,
        trace: TraceEvent[],
        diagnostics?: DiagnosticEntry[],
      ): Outcome => ({
        status: "error",
        error,
        trace,
        diagnostics: diagnostics ?? [],
      }),
      finalizeResult: (
        result: unknown,
        getDiagnostics: () => DiagnosticEntry[],
        trace: TraceEvent[],
      ): Outcome => ({
        status: "ok",
        artefact: { result },
        trace,
        diagnostics: getDiagnostics(),
      }),
      isExecutionIterator: (_value: unknown): _value is ExecutionIterator => true,
      driveIterator: (input: DriveIteratorInput<Outcome>) =>
        input.onInvalidYield({ paused: false }),
    };

    const ctx = {
      input: "run",
      runtime: undefined,
      trace: [],
      diagnosticsMode: "default" as const,
      handleError: (error: unknown): Outcome => ({
        status: "error",
        error,
        trace: [],
        diagnostics: [],
      }),
    };

    const outcome = await runWorkflow(deps, ctx);
    expect(outcome.status).toBe("error");
    expect(outcome.diagnostics.map(readDiagnosticCode)).toContain("resume.invalidYield");
  });
});
