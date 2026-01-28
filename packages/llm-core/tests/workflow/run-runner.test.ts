import { describe, expect, it } from "bun:test";
import type { AdapterBundle } from "#adapters";
import type { DiagnosticEntry } from "#shared/reporting";
import type { TraceEvent } from "#shared/reporting";
import type { Outcome } from "#workflow/types";
import { runWorkflow, type RunWorkflowDeps } from "#workflow/runtime/run-runner";

describe("Workflow run runner", () => {
  it("finalizes pipeline results with diagnostics", async () => {
    const deps: RunWorkflowDeps<Outcome> = {
      pipeline: {
        run: () => ({ artefact: { ok: true } }),
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
      finalizeResult: (input: {
        result: unknown;
        getDiagnostics: () => DiagnosticEntry[];
        trace: TraceEvent[];
      }): Outcome => ({
        status: "ok",
        artefact: { result: input.result, diagnostics: input.getDiagnostics() },
        trace: input.trace,
        diagnostics: input.getDiagnostics(),
      }),
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
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(outcome.artefact).toMatchObject({
      result: { artefact: { ok: true } },
    });
  });
});
