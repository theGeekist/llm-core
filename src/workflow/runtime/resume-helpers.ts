import type { Runtime, ArtefactOf, Outcome, RecipeName } from "../types";
import type { DiagnosticEntry } from "../diagnostics";
import { applyDiagnosticsMode, createResumeDiagnostic } from "../diagnostics";
import { createInvalidResumeDiagnostics } from "./resume-diagnostics";
import type { TraceEvent } from "../trace";

type ResumeAdapterRequired<N extends RecipeName> =
  | { ok: true; adapter: NonNullable<Runtime["resume"]> }
  | { ok: false; outcome: Outcome<ArtefactOf<N>> };

type RequireResumeAdapterInput<N extends RecipeName> = {
  resumeAdapter: Runtime["resume"] | undefined;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  buildDiagnostics: DiagnosticEntry[];
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
};

export const requireResumeAdapter = <N extends RecipeName>(
  input: RequireResumeAdapterInput<N>,
): ResumeAdapterRequired<N> => {
  const resumeAdapter = input.resumeAdapter;
  if (resumeAdapter && typeof resumeAdapter.resolve === "function") {
    return { ok: true, adapter: resumeAdapter };
  }
  const diagnostics = applyDiagnosticsMode(
    [...input.buildDiagnostics, createResumeDiagnostic("Resume requires a resume adapter.")],
    input.diagnosticsMode,
  );
  return {
    ok: false,
    outcome: input.errorOutcome(
      new Error("Resume requires a resume adapter."),
      input.trace,
      diagnostics,
    ),
  };
};

type InvalidResumeTokenInput<N extends RecipeName> = {
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  buildDiagnostics: DiagnosticEntry[];
  message: string;
  code: string;
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
};

export const invalidResumeTokenOutcome = <N extends RecipeName>(
  input: InvalidResumeTokenInput<N>,
) => {
  const diagnostics = createInvalidResumeDiagnostics({
    buildDiagnostics: input.buildDiagnostics,
    diagnosticsMode: input.diagnosticsMode,
    message: input.message,
    code: input.code,
  });
  return input.errorOutcome(new Error(input.message), input.trace, diagnostics);
};
