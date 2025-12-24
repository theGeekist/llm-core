import type { Runtime, ArtefactOf, Outcome, RecipeName } from "../types";
import type { DiagnosticEntry } from "../diagnostics";
import { applyDiagnosticsMode, createResumeDiagnostic } from "../diagnostics";
import { createInvalidResumeDiagnostics } from "./resume-diagnostics";
import type { TraceEvent } from "../trace";

type ResumeAdapterRequired<N extends RecipeName> =
  | { ok: true; adapter: NonNullable<Runtime["resume"]> }
  | { ok: false; outcome: Outcome<ArtefactOf<N>> };

export const requireResumeAdapter = <N extends RecipeName>(
  resumeAdapter: Runtime["resume"] | undefined,
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  buildDiagnostics: DiagnosticEntry[],
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>,
): ResumeAdapterRequired<N> => {
  if (resumeAdapter && typeof resumeAdapter.resolve === "function") {
    return { ok: true, adapter: resumeAdapter };
  }
  const diagnostics = applyDiagnosticsMode(
    [...buildDiagnostics, createResumeDiagnostic("Resume requires a resume adapter.")],
    diagnosticsMode,
  );
  return {
    ok: false,
    outcome: errorOutcome(new Error("Resume requires a resume adapter."), trace, diagnostics),
  };
};

export const invalidResumeTokenOutcome = <N extends RecipeName>(
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  buildDiagnostics: DiagnosticEntry[],
  message: string,
  code: string,
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>,
) => {
  const diagnostics = createInvalidResumeDiagnostics(
    buildDiagnostics,
    diagnosticsMode,
    message,
    code,
  );
  return errorOutcome(new Error(message), trace, diagnostics);
};

export const createInvalidResumeYieldOutcome = <N extends RecipeName>(
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  buildDiagnostics: DiagnosticEntry[],
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>,
) =>
  function invalidResumeYieldOutcome(value: unknown) {
    void value;
    const message = "Iterator yielded a non-paused value.";
    const diagnostics = createInvalidResumeDiagnostics(
      buildDiagnostics,
      diagnosticsMode,
      message,
      "resume.invalidYield",
    );
    return errorOutcome(new Error(message), trace, diagnostics);
  };
