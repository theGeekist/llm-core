import type {
  ArtefactOf,
  Outcome,
  PipelineContext,
  PipelineWithExtensions,
  RecipeName,
  RunOptions,
  Runtime,
} from "../types";
import type { PipelineReporter } from "@wpkernel/pipeline/core";
import type { AdapterBundle } from "../../adapters/types";
import type { DiagnosticEntry } from "../diagnostics";
import type { TraceEvent } from "../trace";
import type { MaybePromise } from "../../maybe";
import type { PauseSession } from "../driver/types";
import { bindFirst, maybeChain, maybeMap, maybeTap, maybeTry } from "../../maybe";
import { attachAdapterContext, createAdapterContext } from "../adapter-context";
import { createSnapshotRecorder, resolveSessionStore, type ResumeSession } from "./resume-session";
import { readResumeOptions, type ResumeOptions } from "../resume";
import { runResumedPipeline } from "./resume-runner";
import { normalizeDiagnostics, applyDiagnosticsMode } from "../diagnostics";
import { createFinalize, type FinalizeResult } from "./helpers";
import { createFinalizeWithInterrupt } from "./pause-metadata";
import type { AdapterResolution, PipelineRunner, ResumeHandlerDeps } from "./resume-types";
export type ActiveResumeSession = Exclude<ResumeSession, { kind: "invalid" }>;

type ResumeExecution<N extends RecipeName> = {
  deps: ResumeHandlerDeps<N>;
  resolvedAdapters: AdapterBundle;
  resumeOptions: ResumeOptions;
  resumeDiagnostics: DiagnosticEntry[];
  resumeRuntime: Runtime | undefined;
  resumeDiagnosticsMode: "default" | "strict";
  runtime: Runtime | undefined;
  trace: TraceEvent[];
  session: ActiveResumeSession;
  token: unknown;
  pauseSessions: Map<unknown, PauseSession>;
  resumeError: (error: unknown) => MaybePromise<Outcome<ArtefactOf<N>>>;
};

type PauseDiagnosticsInput = {
  session: ActiveResumeSession;
  resumeExtraDiagnostics: DiagnosticEntry[];
  adapterDiagnostics: DiagnosticEntry[];
};

const readPauseDiagnostics = (input: PauseDiagnosticsInput) =>
  input.session.kind === "pause"
    ? input.session.session
        .getDiagnostics()
        .concat(input.adapterDiagnostics, input.resumeExtraDiagnostics)
    : input.resumeExtraDiagnostics.concat(input.adapterDiagnostics);

type PauseSnapshot = PauseSession["snapshot"];

type ResumeSnapshotState = {
  runOptions?: RunOptions;
  context?: PipelineContext;
  reporter?: PipelineReporter;
};

const readSnapshotState = (snapshot: PauseSnapshot): ResumeSnapshotState =>
  snapshot.state as ResumeSnapshotState;

const readSnapshotReporter = (snapshot: PauseSnapshot) => {
  const state = readSnapshotState(snapshot);
  return state.reporter ?? state.context?.reporter;
};

const resolveResumeReporter = (snapshot: PauseSnapshot, runtime: Runtime | undefined) =>
  runtime?.reporter ?? readSnapshotReporter(snapshot) ?? {};

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

const updateResumeSnapshot = (
  snapshot: PauseSnapshot,
  runOptions: RunOptions,
  context: PipelineContext,
  reporter: PipelineReporter,
): PauseSnapshot => ({
  ...snapshot,
  state: {
    ...(snapshot.state as Record<string, unknown>),
    runOptions,
    context,
    reporter,
  },
});

const readPipelineResume = (pipeline: PipelineWithExtensions | PipelineRunner) =>
  (pipeline as { resume?: PipelineWithExtensions["resume"] }).resume;

const resumePipeline = (
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

type ResumeFinalizeInput<TOutcome> = {
  finalize: FinalizeResult<TOutcome>;
  getDiagnostics: () => DiagnosticEntry[];
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
};

const finalizeResumeResult = <TOutcome>(input: ResumeFinalizeInput<TOutcome>, result: unknown) =>
  input.finalize(result, input.getDiagnostics, input.trace, input.diagnosticsMode);

type ResumeErrorInput<N extends RecipeName> = {
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[];
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
};

const resumeErrorFromInput = <N extends RecipeName>(input: ResumeErrorInput<N>, error: unknown) =>
  input.errorOutcome(
    error,
    input.trace,
    applyDiagnosticsMode(input.readErrorDiagnostics(error), input.diagnosticsMode),
  );

const createResumeError = <N extends RecipeName>(
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[],
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>,
) =>
  bindFirst(resumeErrorFromInput<N>, {
    trace,
    diagnosticsMode,
    readErrorDiagnostics,
    errorOutcome,
  });

const createResumeDeletion = <N extends RecipeName>(
  session: ActiveResumeSession,
  token: unknown,
): ((outcome: Outcome<ArtefactOf<N>>) => MaybePromise<boolean | null>) | undefined => {
  const store = session.store;
  if (!store) {
    return undefined;
  }
  return function deleteResumeSession(outcome: Outcome<ArtefactOf<N>>) {
    if (outcome.status !== "ok") {
      return false;
    }
    return store.delete(token);
  };
};

const deleteSessionOnSuccess = <N extends RecipeName>(
  session: ActiveResumeSession,
  token: unknown,
  outcome: MaybePromise<Outcome<ArtefactOf<N>>>,
) => {
  const deleteResumeSession = createResumeDeletion<N>(session, token);
  return deleteResumeSession ? maybeTap(deleteResumeSession, outcome) : outcome;
};

const continueResumedPipeline = <N extends RecipeName>(
  resumeDeps: {
    pipeline: PipelineWithExtensions | PipelineRunner;
    resolveAdaptersForRun: (
      runtime?: Runtime,
      providers?: Record<string, string>,
    ) => MaybePromise<AdapterResolution>;
    applyAdapterOverrides: (resolved: AdapterBundle, overrides?: AdapterBundle) => AdapterBundle;
    toResolvedAdapters: (resolution: AdapterResolution) => AdapterBundle;
    readContractDiagnostics: (adapters: AdapterBundle) => DiagnosticEntry[];
    buildDiagnostics: DiagnosticEntry[];
    strictErrorMessage: string;
    trace: TraceEvent[];
    toErrorOutcome: (
      error: unknown,
      trace: TraceEvent[],
      diagnostics?: DiagnosticEntry[],
    ) => Outcome<ArtefactOf<N>>;
  },
  resumeOptions: ResumeOptions,
  resumeDiagnostics: DiagnosticEntry[],
  resumeRuntime: Runtime | undefined,
  resumeDiagnosticsMode: "default" | "strict",
  finalize: FinalizeResult<Outcome<ArtefactOf<N>>>,
) => {
  return runResumedPipeline(
    resumeDeps,
    resumeOptions,
    resumeDiagnostics,
    resumeRuntime,
    resumeDiagnosticsMode,
    finalize,
  );
};

type ContinueSnapshotInput<N extends RecipeName> = {
  pipeline: PipelineWithExtensions | PipelineRunner;
  snapshot: PauseSnapshot;
  resumeOptions: ResumeOptions;
  resumeRuntime: Runtime | undefined;
  adapters: AdapterBundle;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  getDiagnostics: () => DiagnosticEntry[];
  finalize: FinalizeResult<Outcome<ArtefactOf<N>>>;
};

const continueSnapshotPipeline = <N extends RecipeName>(
  input: ContinueSnapshotInput<N>,
): MaybePromise<Outcome<ArtefactOf<N>>> => {
  const reporter = resolveResumeReporter(input.snapshot, input.resumeRuntime);
  const runOptions = buildResumeRunOptions({
    resumeOptions: input.resumeOptions,
    runtime: input.resumeRuntime,
    adapters: input.adapters,
    reporter,
  });
  const context = buildResumeContext({
    reporter,
    runtime: input.resumeRuntime,
    adapters: input.adapters,
  });
  const snapshot = updateResumeSnapshot(input.snapshot, runOptions, context, reporter);
  return maybeChain(
    bindFirst(finalizeResumeResult<Outcome<ArtefactOf<N>>>, {
      finalize: input.finalize,
      getDiagnostics: input.getDiagnostics,
      trace: input.trace,
      diagnosticsMode: input.diagnosticsMode,
    }),
    resumePipeline(input.pipeline, snapshot, input.resumeOptions.input),
  );
};

const isStoredSnapshot = (
  session: ActiveResumeSession,
): session is Extract<ActiveResumeSession, { kind: "snapshot" }> => session.kind === "snapshot";

const readStoredPipelineSnapshot = (session: Extract<ActiveResumeSession, { kind: "snapshot" }>) =>
  session.snapshot.snapshot as PauseSnapshot | undefined;

const resolveAdaptersFromProviders = <N extends RecipeName>(
  deps: ResumeHandlerDeps<N>,
  runtime: Runtime | undefined,
  providers: Record<string, string>,
) =>
  maybeMap(
    bindFirst(selectResolvedAdapters<N>, deps),
    deps.resolveAdaptersForRun(runtime, providers),
  );

const selectResolvedAdapters = <N extends RecipeName>(
  deps: ResumeHandlerDeps<N>,
  resolution: AdapterResolution,
) => deps.toResolvedAdapters(resolution);

const resolveEffectiveAdapters = <N extends RecipeName>(
  deps: ResumeHandlerDeps<N>,
  resolvedAdapters: AdapterBundle,
  resumeOptions: ResumeOptions,
  runtime: Runtime | undefined,
  resumeRuntime: Runtime | undefined,
) => {
  if (resumeOptions.providers) {
    return resolveAdaptersFromProviders(deps, resumeRuntime ?? runtime, resumeOptions.providers);
  }
  return resolvedAdapters;
};

const runResumeWithAdapters = <N extends RecipeName>(
  input: ResumeExecution<N>,
  effectiveAdapters: AdapterBundle,
): MaybePromise<Outcome<ArtefactOf<N>>> => {
  const resumeExtraDiagnostics = normalizeDiagnostics(input.resumeDiagnostics, []);
  const adapterContext = createAdapterContext();
  const adaptersWithContext = attachAdapterContext(effectiveAdapters, adapterContext.context, {
    retryDefaults: input.resumeRuntime?.retryDefaults,
    retry: input.resumeRuntime?.retry,
    trace: input.trace,
  });
  const getPauseDiagnostics = bindFirst(readPauseDiagnostics, {
    session: input.session,
    resumeExtraDiagnostics,
    adapterDiagnostics: adapterContext.diagnostics,
  });
  const store = resolveSessionStore(input.resumeRuntime ?? input.runtime, effectiveAdapters);
  const recordSnapshot = createSnapshotRecorder(store, input.resumeRuntime ?? input.runtime);
  const finalize = createFinalizeWithInterrupt(
    createFinalize<Outcome<ArtefactOf<N>>>(input.deps.finalizeResult, recordSnapshot),
    effectiveAdapters.interrupt,
  );

  const resumeDeps = {
    pipeline: input.deps.pipeline,
    resolveAdaptersForRun: input.deps.resolveAdaptersForRun,
    applyAdapterOverrides: input.deps.applyAdapterOverrides,
    toResolvedAdapters: input.deps.toResolvedAdapters,
    readContractDiagnostics: input.deps.readContractDiagnostics,
    buildDiagnostics: input.deps.buildDiagnostics,
    strictErrorMessage: input.deps.strictErrorMessage,
    trace: input.trace,
    toErrorOutcome: input.deps.errorOutcome,
  };

  if (input.session.kind === "pause") {
    input.pauseSessions.delete(input.token);
    const outcome = continueSnapshotPipeline<N>({
      pipeline: input.deps.pipeline,
      snapshot: input.session.session.snapshot,
      resumeOptions: input.resumeOptions,
      resumeRuntime: input.resumeRuntime,
      adapters: adaptersWithContext,
      trace: input.trace,
      diagnosticsMode: input.resumeDiagnosticsMode,
      getDiagnostics: getPauseDiagnostics,
      finalize,
    });
    return deleteSessionOnSuccess<N>(input.session, input.token, outcome);
  }

  if (isStoredSnapshot(input.session)) {
    const storedSnapshot = readStoredPipelineSnapshot(input.session);
    if (storedSnapshot) {
      const outcome = continueSnapshotPipeline<N>({
        pipeline: input.deps.pipeline,
        snapshot: storedSnapshot,
        resumeOptions: input.resumeOptions,
        resumeRuntime: input.resumeRuntime,
        adapters: adaptersWithContext,
        trace: input.trace,
        diagnosticsMode: input.resumeDiagnosticsMode,
        getDiagnostics: getPauseDiagnostics,
        finalize,
      });
      return deleteSessionOnSuccess<N>(input.session, input.token, outcome);
    }
  }

  const outcome = continueResumedPipeline<N>(
    resumeDeps,
    input.resumeOptions,
    input.resumeDiagnostics,
    input.resumeRuntime,
    input.resumeDiagnosticsMode,
    finalize,
  );
  return deleteSessionOnSuccess<N>(input.session, input.token, outcome);
};

const runResumeWithResolvedAdapters = <N extends RecipeName>(input: ResumeExecution<N>) => {
  if (input.session.kind === "pause") {
    return runResumeWithAdapters(input, input.resolvedAdapters);
  }
  return maybeChain(
    bindFirst(runResumeWithAdapters<N>, input),
    resolveEffectiveAdapters<N>(
      input.deps,
      input.resolvedAdapters,
      input.resumeOptions,
      input.runtime,
      input.resumeRuntime,
    ),
  );
};

const runResumeExecutor = <N extends RecipeName>(input: ResumeExecution<N>) =>
  runResumeWithResolvedAdapters(input);

export const executeResumePipeline = <N extends RecipeName>(
  resumeValue: unknown,
  session: ActiveResumeSession,
  resolvedAdapters: AdapterBundle,
  token: unknown,
  runtime: Runtime | undefined,
  diagnosticsMode: "default" | "strict",
  trace: TraceEvent[],
  deps: ResumeHandlerDeps<N>,
) => {
  const resumeDiagnostics: DiagnosticEntry[] = [];
  const resumeOptions = readResumeOptions(resumeValue, runtime, resumeDiagnostics);
  const resumeRuntime = resumeOptions.runtime;
  const resumeDiagnosticsMode = resumeRuntime?.diagnostics ?? diagnosticsMode;
  const resumeError = createResumeError<N>(
    trace,
    resumeDiagnosticsMode,
    deps.readErrorDiagnostics,
    deps.errorOutcome,
  );

  return maybeTry(
    resumeError,
    bindFirst(runResumeExecutor<N>, {
      deps,
      resolvedAdapters,
      resumeOptions,
      resumeDiagnostics,
      resumeRuntime,
      resumeDiagnosticsMode,
      runtime,
      trace,
      session,
      token,
      pauseSessions: deps.pauseSessions,
      resumeError,
    }),
  );
};
