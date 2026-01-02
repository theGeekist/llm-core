import type { ArtefactOf, Outcome } from "../types";
import type { DiagnosticEntry } from "../diagnostics";
import type { PipelineState, RecipeName } from "../types";
import type { PauseKind } from "../../adapters/types";
import { addTraceEvent, type TraceEvent } from "../trace";
import { readPipelinePauseSnapshot } from "../pause";

export const readArtifact = <N extends RecipeName>(result: unknown): ArtefactOf<N> =>
  ((result as { artifact?: PipelineState }).artifact ?? {}) as ArtefactOf<N>;

const readPausedUserState = (result: unknown): PipelineState | undefined => {
  const snapshot = readPipelinePauseSnapshot(result);
  if (!snapshot) {
    return undefined;
  }
  return (snapshot.state as { userState?: PipelineState }).userState;
};

export const readPartialArtifact = <N extends RecipeName>(
  result: unknown,
  readArtifactValue: (result: unknown) => ArtefactOf<N>,
): Partial<ArtefactOf<N>> =>
  (result as { partialArtifact?: Partial<ArtefactOf<N>> }).partialArtifact ??
  (readPausedUserState(result) as Partial<ArtefactOf<N>> | undefined) ??
  readArtifactValue(result);

type OkOutcomeInput<N extends RecipeName> = {
  result: unknown;
  trace: TraceEvent[];
  diagnostics: DiagnosticEntry[];
  readArtifactValue: (result: unknown) => ArtefactOf<N>;
};

export const toOkOutcome = <N extends RecipeName>(
  input: OkOutcomeInput<N>,
): Outcome<ArtefactOf<N>> => {
  addTraceEvent(input.trace, "run.ok");
  addTraceEvent(input.trace, "run.end", { status: "ok" });
  return {
    status: "ok",
    artefact: input.readArtifactValue(input.result),
    trace: input.trace,
    diagnostics: input.diagnostics,
  };
};

const readPauseMeta = (result: unknown) => {
  const snapshot = readPipelinePauseSnapshot(result);
  if (snapshot) {
    return { token: snapshot.token, pauseKind: snapshot.pauseKind };
  }
  const direct = result as { token?: unknown; pauseKind?: PauseKind };
  if (direct.token !== undefined || direct.pauseKind !== undefined) {
    return { token: direct.token, pauseKind: direct.pauseKind };
  }
  const artifact = (
    result as { artifact?: { __pause?: { token?: unknown; pauseKind?: PauseKind } } }
  ).artifact;
  if (artifact?.__pause) {
    return { token: artifact.__pause.token, pauseKind: artifact.__pause.pauseKind };
  }
  const state = (result as { state?: { __pause?: { token?: unknown; pauseKind?: PauseKind } } })
    .state;
  return { token: state?.__pause?.token, pauseKind: state?.__pause?.pauseKind };
};

export const readPauseFlag = (result: unknown) => {
  if (readPipelinePauseSnapshot(result)) {
    return true;
  }
  const direct = (result as { paused?: boolean }).paused;
  if (direct !== undefined) {
    return direct;
  }
  const artifact = (result as { artifact?: { __pause?: { paused?: boolean } } }).artifact;
  if (artifact?.__pause?.paused !== undefined) {
    return artifact.__pause.paused;
  }
  const state = (result as { state?: { __pause?: { paused?: boolean } } }).state;
  return state?.__pause?.paused;
};

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
