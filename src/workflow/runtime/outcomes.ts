import type { ArtefactOf, Outcome } from "../types";
import type { DiagnosticEntry } from "../diagnostics";
import type { PipelineState, RecipeName } from "../types";
import type { PauseKind } from "../../adapters/types";
import { addTraceEvent, type TraceEvent } from "../trace";

export const readArtifact = <N extends RecipeName>(result: unknown): ArtefactOf<N> =>
  ((result as { artifact?: PipelineState }).artifact ?? {}) as ArtefactOf<N>;

export const readPartialArtifact = <N extends RecipeName>(
  result: unknown,
  readArtifactValue: (result: unknown) => ArtefactOf<N>,
): Partial<ArtefactOf<N>> =>
  ((result as { partialArtifact?: Partial<ArtefactOf<N>> }).partialArtifact ??
    readArtifactValue(result)) as Partial<ArtefactOf<N>>;

export const toOkOutcome = <N extends RecipeName>(
  result: unknown,
  trace: TraceEvent[],
  diagnostics: DiagnosticEntry[],
  readArtifactValue: (result: unknown) => ArtefactOf<N>,
): Outcome<ArtefactOf<N>> => {
  addTraceEvent(trace, "run.ok");
  addTraceEvent(trace, "run.end", { status: "ok" });
  return {
    status: "ok",
    artefact: readArtifactValue(result),
    trace,
    diagnostics,
  };
};

export const toPausedOutcome = <N extends RecipeName>(
  result: unknown,
  trace: TraceEvent[],
  diagnostics: DiagnosticEntry[],
  readPartial: (result: unknown) => Partial<ArtefactOf<N>>,
): Outcome<ArtefactOf<N>> => {
  const pauseKind = (result as { pauseKind?: PauseKind }).pauseKind;
  addTraceEvent(trace, "run.paused", pauseKind ? { pauseKind } : undefined);
  addTraceEvent(trace, "run.end", { status: "paused" });
  return {
    status: "paused",
    token: (result as { token?: unknown }).token,
    artefact: readPartial(result),
    trace,
    diagnostics,
  };
};

export const toErrorOutcome = <N extends RecipeName>(
  error: unknown,
  trace: TraceEvent[],
  diagnostics: DiagnosticEntry[] | undefined,
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[],
): Outcome<ArtefactOf<N>> => {
  addTraceEvent(trace, "run.error", { error });
  addTraceEvent(trace, "run.end", { status: "error" });
  return {
    status: "error",
    error,
    trace,
    diagnostics: diagnostics ?? readErrorDiagnostics(error),
  };
};

export const createRunErrorHandler = <N extends RecipeName>(
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[],
  applyMode: (diagnostics: DiagnosticEntry[], mode: "default" | "strict") => DiagnosticEntry[],
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>,
) =>
  function handleRunError(error: unknown) {
    return errorOutcome(error, trace, applyMode(readErrorDiagnostics(error), diagnosticsMode));
  };
