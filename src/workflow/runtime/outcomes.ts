import type { ArtefactOf, Outcome } from "../types";
import type { DiagnosticEntry } from "../../shared/diagnostics";
import type { PipelineState, RecipeName } from "../types";
import { addTraceEvent, type TraceEvent } from "../../shared/trace";
import { readPausedUserState, readPauseFlag, readPauseMeta } from "../pause";

export const readArtefact = <N extends RecipeName>(result: unknown): ArtefactOf<N> =>
  ((result as { artefact?: PipelineState }).artefact ?? {}) as ArtefactOf<N>;

const readPausedUserStateFromResult = (result: unknown): PipelineState | null =>
  readPausedUserState<PipelineState>(result);

export const readPartialArtefact = <N extends RecipeName>(
  result: unknown,
  readArtefactValue: (result: unknown) => ArtefactOf<N>,
): Partial<ArtefactOf<N>> =>
  (result as { partialArtefact?: Partial<ArtefactOf<N>> }).partialArtefact ??
  (readPausedUserStateFromResult(result) as Partial<ArtefactOf<N>> | undefined) ??
  readArtefactValue(result);

type OkOutcomeInput<N extends RecipeName> = {
  result: unknown;
  trace: TraceEvent[];
  diagnostics: DiagnosticEntry[];
  readArtefactValue: (result: unknown) => ArtefactOf<N>;
};

export const toOkOutcome = <N extends RecipeName>(
  input: OkOutcomeInput<N>,
): Outcome<ArtefactOf<N>> => {
  addTraceEvent(input.trace, "run.ok");
  addTraceEvent(input.trace, "run.end", { status: "ok" });
  return {
    status: "ok",
    artefact: input.readArtefactValue(input.result),
    trace: input.trace,
    diagnostics: input.diagnostics,
  };
};

export { readPauseFlag, readPauseMeta };

type PausedOutcomeInput<N extends RecipeName> = {
  result: unknown;
  trace: TraceEvent[];
  diagnostics: DiagnosticEntry[];
  readPartial: (result: unknown) => Partial<ArtefactOf<N>>;
};

export const toPausedOutcome = <N extends RecipeName>(
  input: PausedOutcomeInput<N>,
): Outcome<ArtefactOf<N>> => {
  const pauseMeta = readPauseMeta(input.result);
  const pauseKind = pauseMeta.pauseKind;
  addTraceEvent(input.trace, "run.paused", pauseKind ? { pauseKind } : undefined);
  addTraceEvent(input.trace, "run.end", { status: "paused" });
  return {
    status: "paused",
    token: pauseMeta.token,
    artefact: input.readPartial(input.result),
    trace: input.trace,
    diagnostics: input.diagnostics,
  };
};

type ErrorOutcomeInput = {
  error: unknown;
  trace: TraceEvent[];
  diagnostics: DiagnosticEntry[] | undefined;
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[];
};

export const toErrorOutcome = <N extends RecipeName>(
  input: ErrorOutcomeInput,
): Outcome<ArtefactOf<N>> => {
  addTraceEvent(input.trace, "run.error", { error: input.error });
  addTraceEvent(input.trace, "run.end", { status: "error" });
  return {
    status: "error",
    error: input.error,
    trace: input.trace,
    diagnostics: input.diagnostics ?? input.readErrorDiagnostics(input.error),
  };
};

type RunErrorHandlerInput<N extends RecipeName> = {
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[];
  applyMode: (diagnostics: DiagnosticEntry[], mode: "default" | "strict") => DiagnosticEntry[];
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
};

export const createRunErrorHandler = <N extends RecipeName>(input: RunErrorHandlerInput<N>) =>
  function handleRunError(error: unknown) {
    return input.errorOutcome(
      error,
      input.trace,
      input.applyMode(input.readErrorDiagnostics(error), input.diagnosticsMode),
    );
  };
