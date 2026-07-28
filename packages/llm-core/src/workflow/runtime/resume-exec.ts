import type { AdapterBundle, AdapterResumeResult } from "#adapters/types";
import { bindFirst } from "#shared/fp";
import { maybeChain, maybeTap, maybeTry, type MaybePromise } from "#shared/maybe";
import { applyDiagnosticsMode, type TraceEvent } from "#shared/reporting";
import type { PipelineReporter } from "@wpkernel/pipeline/core";
import { consumePauseSession } from "../driver/sessions";
import type { PauseSession } from "../driver/types";
import {
  readPauseSnapshotReporterFromSnapshot,
  readPauseSnapshotStateFromSnapshot,
} from "../pause";
import { readResumeOptions, type ResumeOptions } from "../resume";
import type {
  ArtefactOf,
  Outcome,
  PipelineContext,
  PipelineWithExtensions,
  RecipeName,
  RunOptions,
  Runtime,
} from "../types";
import type { FinalizeResult } from "./helpers";
import { createRuntimeFinalize } from "./pause-metadata";
import { executePipelineResolution } from "./pipeline-runner";
import type {
  AdapterResolution,
  PipelineRunner,
  ResumeErrorInput,
  ResumeHandlerDeps,
} from "./resume-types";

type PauseSnapshot = PauseSession["snapshot"];

const resolveResumeReporter = (snapshot: PauseSnapshot, runtime: Runtime | undefined) =>
  runtime?.reporter ?? readPauseSnapshotReporterFromSnapshot(snapshot) ?? {};

const buildResumeRunOptions = (input: {
  resumeOptions: ResumeOptions;
  runtime: Runtime | undefined;
  adapters: AdapterBundle;
  reporter: PipelineReporter;
}): RunOptions => ({
  input: input.resumeOptions.input,
  runtime: input.runtime,
  reporter: input.reporter,
  adapters: input.adapters,
});

const buildResumeContext = (input: {
  reporter: PipelineReporter;
  runtime: Runtime | undefined;
  adapters: AdapterBundle;
}): PipelineContext => ({
  reporter: input.reporter,
  runtime: input.runtime,
  adapters: input.adapters,
});

const rebindPipelineSnapshot = (input: {
  snapshot: PauseSnapshot;
  runOptions: RunOptions;
  context: PipelineContext;
  reporter: PipelineReporter;
}): PauseSnapshot => ({
  ...input.snapshot,
  state: {
    ...(readPauseSnapshotStateFromSnapshot(input.snapshot) as Record<string, unknown>),
    runOptions: input.runOptions,
    context: input.context,
    reporter: input.reporter,
  },
});

const readPipelineResume = (pipeline: PipelineWithExtensions | PipelineRunner) =>
  (pipeline as { resume?: PipelineWithExtensions["resume"] }).resume;

export const resumePipeline = (
  pipeline: PipelineWithExtensions | PipelineRunner,
  snapshot: PauseSnapshot,
  resumeInput: unknown,
): MaybePromise<unknown> => {
  const resume = readPipelineResume(pipeline);
  if (typeof resume !== "function") {
    throw new Error("Pipeline resume is not available.");
  }
  return resume(snapshot, resumeInput);
};

const resumeErrorFromInput = <N extends RecipeName>(
  input: ResumeErrorInput<ArtefactOf<N>>,
  error: unknown,
) =>
  input.errorOutcome(
    error,
    input.trace,
    applyDiagnosticsMode(input.readErrorDiagnostics(error), input.diagnosticsMode),
  );

const createResumeError = <N extends RecipeName>(input: ResumeErrorInput<ArtefactOf<N>>) =>
  bindFirst(resumeErrorFromInput<N>, input);

type ContinueSnapshotInput<N extends RecipeName> = {
  deps: ResumeHandlerDeps<N>;
  resolution: AdapterResolution;
  snapshot: PauseSnapshot;
  resumeOptions: ResumeOptions;
  resumeRuntime: Runtime | undefined;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  extraDiagnostics: ReturnType<PauseSession["getDiagnostics"]>;
  finalize: FinalizeResult<Outcome<ArtefactOf<N>>>;
};

const selectResumeAdapters = <N extends RecipeName>(
  input: Pick<ContinueSnapshotInput<N>, "deps" | "resumeOptions">,
  resolution: AdapterResolution,
) =>
  input.deps.applyAdapterOverrides(
    input.deps.toResolvedAdapters(resolution),
    input.resumeOptions.adapters,
  );

const executeSnapshotPipeline = <N extends RecipeName>(
  input: ContinueSnapshotInput<N>,
  execution: { adaptersWithContext: AdapterBundle },
) => {
  const reporter = resolveResumeReporter(input.snapshot, input.resumeRuntime);
  const runOptions = buildResumeRunOptions({
    resumeOptions: input.resumeOptions,
    runtime: input.resumeRuntime,
    adapters: execution.adaptersWithContext,
    reporter,
  });
  const context = buildResumeContext({
    reporter,
    runtime: input.resumeRuntime,
    adapters: execution.adaptersWithContext,
  });
  return resumePipeline(
    input.deps.pipeline,
    rebindPipelineSnapshot({
      snapshot: input.snapshot,
      runOptions,
      context,
      reporter,
    }),
    input.resumeOptions.input,
  );
};

const selectSnapshotFinalize = <N extends RecipeName>(
  input: ContinueSnapshotInput<N>,
  _adapters: AdapterBundle,
) => {
  void _adapters;
  return input.finalize;
};

const continueSnapshotPipeline = <N extends RecipeName>(
  input: ContinueSnapshotInput<N>,
): MaybePromise<Outcome<ArtefactOf<N>>> =>
  executePipelineResolution({
    deps: {
      pipeline: input.deps.pipeline,
      readContractDiagnostics: input.deps.readContractDiagnostics,
      buildDiagnostics: input.deps.buildDiagnostics,
      strictErrorMessage: input.deps.strictErrorMessage,
      toErrorOutcome: input.deps.errorOutcome,
    },
    resolution: input.resolution,
    selectAdapters: bindFirst(selectResumeAdapters<N>, input),
    input: input.resumeOptions.input,
    runtime: input.resumeRuntime,
    trace: input.trace,
    diagnosticsMode: input.diagnosticsMode,
    strictDiagnostics: input.extraDiagnostics,
    extraDiagnostics: input.extraDiagnostics,
    createFinalize: bindFirst(selectSnapshotFinalize<N>, input),
    execute: bindFirst(executeSnapshotPipeline<N>, input),
  });

type ResumeExecution<N extends RecipeName> = {
  deps: ResumeHandlerDeps<N>;
  resumeOptions: ResumeOptions;
  resumeRuntime: Runtime | undefined;
  resumeDiagnosticsMode: "default" | "strict";
  trace: TraceEvent[];
  pauseSession: PauseSession;
  token: unknown;
};

const runResumeWithResolution = <N extends RecipeName>(
  input: ResumeExecution<N>,
  resolution: AdapterResolution,
): MaybePromise<Outcome<ArtefactOf<N>>> => {
  const effectiveAdapters = selectResumeAdapters(input, resolution);
  const finalize = createRuntimeFinalize({
    finalizeResult: input.deps.finalizeResult,
    interrupt: effectiveAdapters.interrupt,
  });
  const outcome = continueSnapshotPipeline<N>({
    deps: input.deps,
    resolution,
    snapshot: input.pauseSession.snapshot,
    resumeOptions: input.resumeOptions,
    resumeRuntime: input.resumeRuntime,
    trace: input.trace,
    diagnosticsMode: input.resumeDiagnosticsMode,
    extraDiagnostics: input.pauseSession.getDiagnostics(),
    finalize,
  });
  return maybeTap(
    bindFirst(consumePauseSession, {
      sessions: input.deps.pauseSessions,
      session: input.pauseSession,
      token: input.token,
    }),
    outcome,
  );
};

type ExecuteResumePipelineInput<N extends RecipeName> = {
  resumeValue: AdapterResumeResult;
  pauseSession: PauseSession;
  resolution: AdapterResolution;
  token: unknown;
  runtime: Runtime | undefined;
  diagnosticsMode: "default" | "strict";
  trace: TraceEvent[];
  deps: ResumeHandlerDeps<N>;
};

export const executeResumePipeline = <N extends RecipeName>(
  input: ExecuteResumePipelineInput<N>,
) => {
  const resumeOptions = readResumeOptions(input.resumeValue, input.runtime);
  const resumeRuntime = resumeOptions.runtime;
  const resumeDiagnosticsMode = resumeRuntime?.diagnostics ?? input.diagnosticsMode;
  const resumeError = createResumeError<N>({
    trace: input.trace,
    diagnosticsMode: resumeDiagnosticsMode,
    readErrorDiagnostics: input.deps.readErrorDiagnostics,
    errorOutcome: input.deps.errorOutcome,
  });

  return maybeTry(resumeError, () => {
    const execution: ResumeExecution<N> = {
      deps: input.deps,
      resumeOptions,
      resumeRuntime,
      resumeDiagnosticsMode,
      trace: input.trace,
      pauseSession: input.pauseSession,
      token: input.token,
    };
    const resolution = resumeOptions.providers
      ? input.deps.resolveAdaptersForRun(resumeRuntime ?? input.runtime, resumeOptions.providers)
      : input.resolution;
    return maybeChain(bindFirst(runResumeWithResolution<N>, execution), resolution);
  });
};
