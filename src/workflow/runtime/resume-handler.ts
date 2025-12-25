import type {
  ArtefactOf,
  Outcome,
  RecipeName,
  ResumeInputOf,
  RunInputOf,
  Runtime,
  WorkflowRuntime,
  PipelineWithExtensions,
} from "../types";
import type { AdapterBundle, AdapterDiagnostic, PauseKind } from "../../adapters/types";
import type { DiagnosticEntry } from "../diagnostics";
import type { TraceEvent } from "../trace";
import type { MaybePromise } from "../../maybe";
import { addTraceEvent, createTrace } from "../trace";
import { chainMaybe, tapMaybe, tryMaybe } from "../../maybe";
import { createSnapshotRecorder } from "./resume-session";
import { readResumeOptions, type ResumeOptions } from "../resume";
import { resolveResumeSession, type ResumeSession } from "./resume-session";
import { runResumedPipeline } from "./resume-runner";
import {
  createInvalidResumeYieldOutcome,
  invalidResumeTokenOutcome,
  requireResumeAdapter,
} from "./resume-helpers";
import type { ExecutionIterator, IteratorFinalize, PauseSession } from "../driver/types";
import { driveIterator } from "../driver/iterator";
import { normalizeDiagnostics, applyDiagnosticsMode } from "../diagnostics";

type AdapterResolution = {
  adapters: AdapterBundle;
  diagnostics: AdapterDiagnostic[];
  constructs: Record<string, unknown>;
};

type ActiveResumeSession = Exclude<ResumeSession, { kind: "invalid" }>;

type PipelineRunner = {
  run: PipelineWithExtensions["run"];
};

export type ResumeHandlerDeps<N extends RecipeName> = {
  contractName: string;
  extensionRegistration: MaybePromise<unknown>;
  resolveAdaptersForRun: (
    runtime?: Runtime,
    providers?: Record<string, string>,
  ) => MaybePromise<AdapterResolution>;
  toResolvedAdapters: (resolution: {
    adapters: AdapterBundle;
    constructs: Record<string, unknown>;
  }) => AdapterBundle;
  applyAdapterOverrides: (resolved: AdapterBundle, overrides?: AdapterBundle) => AdapterBundle;
  readContractDiagnostics: (adapters: AdapterBundle) => DiagnosticEntry[];
  buildDiagnostics: DiagnosticEntry[];
  strictErrorMessage: string;
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[];
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
  finalizeResult: (
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    trace: TraceEvent[],
    diagnosticsMode: "default" | "strict",
    iterator?: ExecutionIterator,
    recordSnapshot?: (result: unknown) => MaybePromise<void>,
  ) => MaybePromise<Outcome<ArtefactOf<N>>>;
  baseAdapters: AdapterBundle;
  pauseSessions: Map<unknown, PauseSession>;
  pipeline: PipelineWithExtensions | PipelineRunner;
};

const readPauseKind = (session: ActiveResumeSession): PauseKind | undefined =>
  session.kind === "iterator" ? session.session.pauseKind : session.snapshot.pauseKind;

const buildIteratorDiagnostics = (
  session: ActiveResumeSession,
  resumeExtraDiagnostics: DiagnosticEntry[],
) =>
  session.kind === "iterator"
    ? function getResumeDiagnostics() {
        return session.session.getDiagnostics().concat(resumeExtraDiagnostics);
      }
    : function getResumeDiagnostics() {
        return resumeExtraDiagnostics;
      };

const createResumeFinalize = <N extends RecipeName>(
  finalizeResult: (
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    trace: TraceEvent[],
    diagnosticsMode: "default" | "strict",
    iterator?: ExecutionIterator,
    recordSnapshot?: (result: unknown) => MaybePromise<void>,
  ) => MaybePromise<Outcome<ArtefactOf<N>>>,
  recordSnapshot: (result: unknown) => MaybePromise<void>,
) =>
  function finalizeResumeResult(
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    runtimeTrace: TraceEvent[],
    mode: "default" | "strict",
    iterator?: ExecutionIterator,
  ) {
    return finalizeResult(result, getDiagnostics, runtimeTrace, mode, iterator, recordSnapshot);
  };

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
  function resumeError(error: unknown) {
    return errorOutcome(
      error,
      trace,
      applyDiagnosticsMode(readErrorDiagnostics(error), diagnosticsMode),
    );
  };

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
  return driveIterator(
    session.session.iterator,
    resumeOptions.input,
    trace,
    getDiagnostics,
    resumeDiagnosticsMode,
    finalize,
    resumeError,
    resumeInvalidYield,
  );
};

const continueResumedPipeline = <N extends RecipeName>(
  resumeDeps: {
    pipeline: PipelineWithExtensions | PipelineRunner;
    resolveAdaptersForRun: (
      runtime?: Runtime,
      providers?: Record<string, string>,
    ) => MaybePromise<AdapterResolution>;
    applyAdapterOverrides: (resolved: AdapterBundle, overrides?: AdapterBundle) => AdapterBundle;
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
) =>
  runResumedPipeline(
    resumeDeps,
    resumeOptions,
    resumeDiagnostics,
    resumeRuntime,
    resumeDiagnosticsMode,
    (result, getDiagnostics, runtimeTrace, mode) =>
      finalize(result, getDiagnostics, runtimeTrace, mode),
  );

export const createResumeHandler =
  <N extends RecipeName>(
    deps: ResumeHandlerDeps<N>,
  ): NonNullable<WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>["resume"]> =>
  (token: unknown, resumeInput?: ResumeInputOf<N>, runtime?: Runtime) => {
    const trace = createTrace();
    addTraceEvent(trace, "run.start", { recipe: deps.contractName, resume: true });
    const diagnosticsMode = runtime?.diagnostics ?? "default";
    const pauseSession = deps.pauseSessions.get(token);
    const handleError = createResumeError<N>(
      trace,
      diagnosticsMode,
      deps.readErrorDiagnostics,
      deps.errorOutcome,
    );

    const performResume = () =>
      startResumePipeline(token, resumeInput, runtime, pauseSession, trace, diagnosticsMode, deps);

    return tryMaybe(performResume, handleError);
  };

const startResumePipeline = <N extends RecipeName>(
  token: unknown,
  resumeInput: ResumeInputOf<N> | undefined,
  runtime: Runtime | undefined,
  pauseSession: PauseSession | undefined,
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  deps: ResumeHandlerDeps<N>,
) =>
  chainMaybe(deps.extensionRegistration, () =>
    chainMaybe(resolveResumeSession(token, pauseSession, runtime), (session) =>
      resumeFromSession(session, token, resumeInput, runtime, trace, diagnosticsMode, deps),
    ),
  );

const executeResumePipeline = <N extends RecipeName>(
  resumeValue: unknown,
  session: ActiveResumeSession,
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
  const resumeExtraDiagnostics = normalizeDiagnostics(resumeDiagnostics, []);
  const getIteratorDiagnostics = buildIteratorDiagnostics(session, resumeExtraDiagnostics);
  const recordSnapshot = createSnapshotRecorder(resumeRuntime ?? runtime);
  const finalize = createResumeFinalize<N>(deps.finalizeResult, recordSnapshot);

  const resumeDeps = {
    pipeline: deps.pipeline,
    resolveAdaptersForRun: deps.resolveAdaptersForRun,
    applyAdapterOverrides: deps.applyAdapterOverrides,
    readContractDiagnostics: deps.readContractDiagnostics,
    buildDiagnostics: deps.buildDiagnostics,
    strictErrorMessage: deps.strictErrorMessage,
    trace,
    toErrorOutcome: deps.errorOutcome,
  };

  const resumeStep = () => {
    if (session.kind === "iterator") {
      const outcome = continueIterator<N>(
        session,
        token,
        deps.pauseSessions,
        resumeOptions,
        trace,
        getIteratorDiagnostics,
        resumeDiagnosticsMode,
        finalize,
        resumeError,
        resumeInvalidYield,
      );
      return deleteSessionOnSuccess<N>(session, token, outcome);
    }
    const outcome = continueResumedPipeline<N>(
      resumeDeps,
      resumeOptions,
      resumeDiagnostics,
      resumeRuntime,
      resumeDiagnosticsMode,
      finalize,
    );
    return deleteSessionOnSuccess<N>(session, token, outcome);
  };

  return tryMaybe(resumeStep, resumeError);
};

const resumeFromSession = <N extends RecipeName>(
  session: ResumeSession,
  token: unknown,
  resumeInput: ResumeInputOf<N> | undefined,
  runtime: Runtime | undefined,
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  deps: ResumeHandlerDeps<N>,
) => {
  if (session.kind === "invalid") {
    return invalidResumeTokenOutcome<N>(
      trace,
      diagnosticsMode,
      deps.buildDiagnostics,
      "Resume token is invalid or expired.",
      "resume.invalidToken",
      deps.errorOutcome,
    );
  }

  const required = requireResumeAdapter<N>(
    runtime?.resume,
    trace,
    diagnosticsMode,
    deps.buildDiagnostics,
    deps.errorOutcome,
  );
  if (!required.ok) {
    return required.outcome;
  }

  return chainMaybe(deps.resolveAdaptersForRun(runtime), (resolution) => {
    const resolvedAdapters = deps.toResolvedAdapters(resolution);
    return chainMaybe(
      required.adapter.resolve({
        token,
        resumeInput,
        pauseKind: readPauseKind(session as ActiveResumeSession),
        resumeSnapshot: session.kind === "snapshot" ? session.snapshot : undefined,
        runtime,
        adapters: resolvedAdapters,
        declaredAdapters: deps.baseAdapters,
        providers: runtime?.providers,
      }),
      (resumeValue) =>
        executeResumePipeline(
          resumeValue,
          session as ActiveResumeSession,
          token,
          runtime,
          diagnosticsMode,
          trace,
          deps,
        ),
    );
  });
};
