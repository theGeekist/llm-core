import type { ArtefactOf, Outcome, PipelineWithExtensions, RecipeName, Runtime } from "../types";
import type { AdapterBundle } from "../../adapters/types";
import type { DiagnosticEntry } from "../diagnostics";
import type { TraceEvent } from "../trace";
import type { MaybePromise } from "../../maybe";
import type { IteratorFinalize, PauseSession } from "../driver/types";
import { bindFirst, chainMaybe, mapMaybe, tapMaybe, tryMaybe } from "../../maybe";
import { createSnapshotRecorder, resolveSessionStore, type ResumeSession } from "./resume-session";
import { readResumeOptions, type ResumeOptions } from "../resume";
import { runResumedPipeline } from "./resume-runner";
import { createInvalidResumeYieldOutcome } from "./resume-helpers";
import { driveIterator } from "../driver/iterator";
import { normalizeDiagnostics, applyDiagnosticsMode } from "../diagnostics";
import { createFinalize } from "./helpers";
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
  resumeInvalidYield: (value: unknown) => MaybePromise<Outcome<ArtefactOf<N>>>;
};

type IteratorDiagnosticsInput = {
  session: ActiveResumeSession;
  resumeExtraDiagnostics: DiagnosticEntry[];
};

const readIteratorDiagnostics = (input: IteratorDiagnosticsInput) => {
  if (input.session.kind === "iterator") {
    return input.session.session.getDiagnostics().concat(input.resumeExtraDiagnostics);
  }
  return input.resumeExtraDiagnostics;
};

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
): ((outcome: Outcome<ArtefactOf<N>>) => MaybePromise<void>) | undefined => {
  const store = session.store;
  if (!store) {
    return undefined;
  }
  return function deleteResumeSession(outcome: Outcome<ArtefactOf<N>>) {
    if (outcome.status !== "ok") {
      return undefined;
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
  return deleteResumeSession ? tapMaybe(outcome, deleteResumeSession) : outcome;
};

const continueIterator = <N extends RecipeName>(
  session: Extract<ActiveResumeSession, { kind: "iterator" }>,
  token: unknown,
  pauseSessions: Map<unknown, PauseSession>,
  resumeOptions: ResumeOptions,
  trace: TraceEvent[],
  getDiagnostics: () => DiagnosticEntry[],
  resumeDiagnosticsMode: "default" | "strict",
  finalize: IteratorFinalize<Outcome<ArtefactOf<N>>>,
  resumeError: (error: unknown) => MaybePromise<Outcome<ArtefactOf<N>>>,
  resumeInvalidYield: (value: unknown) => MaybePromise<Outcome<ArtefactOf<N>>>,
): MaybePromise<Outcome<ArtefactOf<N>>> => {
  pauseSessions.delete(token);
  return driveIterator({
    iterator: session.session.iterator,
    input: resumeOptions.input,
    trace,
    getDiagnostics,
    diagnosticsMode: resumeDiagnosticsMode,
    finalize,
    onError: resumeError,
    onInvalidYield: resumeInvalidYield,
  });
};

const bindFinalize = <TOutcome>(finalize: IteratorFinalize<TOutcome>) =>
  function finalizeResumedResult(
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    runtimeTrace: TraceEvent[],
    mode: "default" | "strict",
  ) {
    return finalize(result, getDiagnostics, runtimeTrace, mode);
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
  finalize: IteratorFinalize<Outcome<ArtefactOf<N>>>,
) => {
  const finalizeResumed = bindFinalize(finalize);
  return runResumedPipeline(
    resumeDeps,
    resumeOptions,
    resumeDiagnostics,
    resumeRuntime,
    resumeDiagnosticsMode,
    finalizeResumed,
  );
};

const resolveAdaptersFromProviders = <N extends RecipeName>(
  deps: ResumeHandlerDeps<N>,
  runtime: Runtime | undefined,
  providers: Record<string, string>,
) =>
  mapMaybe(
    deps.resolveAdaptersForRun(runtime, providers),
    bindFirst(selectResolvedAdapters<N>, deps),
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
  const getIteratorDiagnostics = bindFirst(readIteratorDiagnostics, {
    session: input.session,
    resumeExtraDiagnostics,
  });
  const store = resolveSessionStore(input.resumeRuntime ?? input.runtime, effectiveAdapters);
  const recordSnapshot = createSnapshotRecorder(store, input.resumeRuntime ?? input.runtime);
  const finalize = createFinalize<Outcome<ArtefactOf<N>>>(
    input.deps.finalizeResult,
    recordSnapshot,
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

  if (input.session.kind === "iterator") {
    const outcome = continueIterator<N>(
      input.session,
      input.token,
      input.pauseSessions,
      input.resumeOptions,
      input.trace,
      getIteratorDiagnostics,
      input.resumeDiagnosticsMode,
      finalize,
      input.resumeError,
      input.resumeInvalidYield,
    );
    return deleteSessionOnSuccess<N>(input.session, input.token, outcome);
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
  if (input.session.kind === "iterator") {
    return runResumeWithAdapters(input, input.resolvedAdapters);
  }
  return chainMaybe(
    resolveEffectiveAdapters<N>(
      input.deps,
      input.resolvedAdapters,
      input.resumeOptions,
      input.runtime,
      input.resumeRuntime,
    ),
    bindFirst(runResumeWithAdapters<N>, input),
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
  const resumeInvalidYield = createInvalidResumeYieldOutcome<N>(
    trace,
    resumeDiagnosticsMode,
    deps.buildDiagnostics,
    deps.errorOutcome,
  );

  return tryMaybe(
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
      resumeInvalidYield,
    }),
    resumeError,
  );
};
