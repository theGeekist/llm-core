import { describe, expect, it } from "bun:test";
import type { AdapterBundle, AdapterDiagnostic, Tool } from "#adapters";
import type { DiagnosticEntry } from "#workflow/diagnostics";
import type { TraceEvent } from "#workflow/trace";
import type { Outcome } from "#workflow/types";
import { runResumedPipeline } from "#workflow/runtime/resume-runner";
import { diagnosticMessages, resolveMaybe } from "./helpers";
import { toResolvedAdapters } from "#workflow/runtime/adapters";

describe("Workflow resume runner", () => {
  const buildDiagnostics: DiagnosticEntry[] = [
    { level: "warn", kind: "workflow", message: "build" },
  ];
  const trace: TraceEvent[] = [];

  it("returns strict errors before resuming the pipeline", async () => {
    let ran = false;
    let finalized = false;
    const adapterDiagnostics: AdapterDiagnostic[] = [{ level: "error", message: "adapter error" }];
    const deps = {
      pipeline: {
        run: () => {
          ran = true;
          return "value";
        },
      },
      resolveAdaptersForRun: () => ({
        adapters: { constructs: {} },
        diagnostics: adapterDiagnostics,
        constructs: {},
      }),
      applyAdapterOverrides: (resolved: AdapterBundle) => resolved,
      toResolvedAdapters,
      readContractDiagnostics: () => [],
      buildDiagnostics,
      strictErrorMessage: "resume strict failure",
      trace,
      toErrorOutcome: (
        error: unknown,
        traceEntries: TraceEvent[],
        diagnostics?: DiagnosticEntry[],
      ) =>
        ({
          status: "error",
          error,
          trace: traceEntries,
          diagnostics: diagnostics ?? [],
        }) satisfies Outcome<unknown>,
    };

    const finalize = () => {
      finalized = true;
      return {
        status: "ok",
        artefact: "ok",
        trace,
        diagnostics: [],
      } satisfies Outcome<unknown>;
    };

    const outcome = await resolveMaybe(
      runResumedPipeline(deps, { input: "resume" }, [], undefined, "strict", finalize),
    );

    expect(ran).toBe(false);
    expect(finalized).toBe(false);
    expect(outcome.status).toBe("error");
    expect(diagnosticMessages(outcome.diagnostics)).toContain("adapter error");
  });

  it("propagates adapter context diagnostics when resuming", async () => {
    const tool: Tool = {
      name: "tool",
      execute: (_input, context) => {
        context?.report?.({ level: "warn", message: "tool warning" });
        return "ok";
      },
    };
    const resolvedAdapters: AdapterBundle = {
      tools: [tool],
      constructs: {},
    };
    const resumeDiagnostics: DiagnosticEntry[] = [
      { level: "warn", kind: "resume", message: "resume warning" },
    ];
    const deps = {
      pipeline: {
        run: (options: { adapters?: AdapterBundle }) => {
          const tool = options.adapters?.tools?.[0];
          if (!tool?.execute) {
            throw new Error("Expected tool execution to be available.");
          }
          return tool.execute({ input: "hi" });
        },
      },
      resolveAdaptersForRun: () => ({
        adapters: resolvedAdapters,
        diagnostics: [],
        constructs: {},
      }),
      applyAdapterOverrides: (resolved: AdapterBundle) => resolved,
      toResolvedAdapters,
      readContractDiagnostics: () => [],
      buildDiagnostics,
      strictErrorMessage: "resume strict failure",
      trace,
      toErrorOutcome: (
        error: unknown,
        traceEntries: TraceEvent[],
        diagnostics?: DiagnosticEntry[],
      ) =>
        ({
          status: "error",
          error,
          trace: traceEntries,
          diagnostics: diagnostics ?? [],
        }) satisfies Outcome<unknown>,
    };

    const finalize = (
      result: unknown,
      getDiagnostics: () => DiagnosticEntry[],
      traceEntries: TraceEvent[],
    ) =>
      ({
        status: "ok",
        artefact: result,
        trace: traceEntries,
        diagnostics: getDiagnostics(),
      }) satisfies Outcome<unknown>;

    const outcome = await resolveMaybe(
      runResumedPipeline(
        deps,
        { input: "resume" },
        resumeDiagnostics,
        undefined,
        "default",
        finalize,
      ),
    );

    expect(outcome.status).toBe("ok");
    expect(diagnosticMessages(outcome.diagnostics)).toContain("tool warning");
    expect(diagnosticMessages(outcome.diagnostics)).toContain("resume warning");
  });
});
