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
  resumeKey?: string;
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

type UpdateResumeSnapshotInput = {
  snapshot: PauseSnapshot;
  runOptions: RunOptions;
  context: PipelineContext;
  reporter: PipelineReporter;
};

const updateResumeSnapshot = (input: UpdateResumeSnapshotInput): PauseSnapshot => ({
  ...input.snapshot,
  state: {
    ...(input.snapshot.state as Record<string, unknown>),
    runOptions: input.runOptions,
    context: input.context,
    reporter: input.reporter,
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
  input.finalize({
    result,
    getDiagnostics: input.getDiagnostics,
    trace: input.trace,
    diagnosticsMode: input.diagnosticsMode,
  });

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

type CreateResumeErrorInput<N extends RecipeName> = {
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[];
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
};

const createResumeError = <N extends RecipeName>(input: CreateResumeErrorInput<N>) =>
  bindFirst(resumeErrorFromInput<N>, {
    trace: input.trace,
    diagnosticsMode: input.diagnosticsMode,
    readErrorDiagnostics: input.readErrorDiagnostics,
    errorOutcome: input.errorOutcome,
  });

type ResumeDeleteInput = {
  store: NonNullable<ActiveResumeSession["store"]>;
  tokens: unknown[];
  index: number;
};

const addTokenIfUnique = (tokens: unknown[], token: unknown) => {
  if (token === undefined) {
    return tokens;
  }
  if (!tokens.includes(token)) {
    tokens.push(token);
  }
  return tokens;
};

const collectResumeTokens = (
  session: ActiveResumeSession,
  token: unknown,
  resumeKey: string | undefined,
) => {
  const tokens: unknown[] = [];
  addTokenIfUnique(tokens, token);
  if (resumeKey !== undefined) {
    addTokenIfUnique(tokens, resumeKey);
  }
  if (session.kind === "snapshot") {
    addTokenIfUnique(tokens, session.snapshot.token);
  }
  if (session.kind === "pause") {
    addTokenIfUnique(tokens, session.session.snapshot.token);
  }
  return tokens;
};

const deleteNextResumeToken = (input: ResumeDeleteInput): MaybePromise<boolean | null> => {
  if (input.index >= input.tokens.length) {
    return true;
  }
  const result = input.store.delete(input.tokens[input.index]);
  if (input.index + 1 >= input.tokens.length) {
    return result;
  }
  return maybeChain(
    bindFirst(deleteNextResumeToken, {
      store: input.store,
      tokens: input.tokens,
      index: input.index + 1,
    }),
    result,
  );
};

const deleteResumeTokens = (store: ResumeDeleteInput["store"], tokens: unknown[]) =>
  deleteNextResumeToken({ store, tokens, index: 0 });

const createResumeDeletion = <N extends RecipeName>(
  session: ActiveResumeSession,
  token: unknown,
  resumeKey: string | undefined,
): ((outcome: Outcome<ArtefactOf<N>>) => MaybePromise<boolean | null>) | undefined => {
  const store = session.store;
  if (!store) {
    return undefined;
  }
  return function deleteResumeSession(outcome: Outcome<ArtefactOf<N>>) {
    if (outcome.status !== "ok") {
      return false;
    }
    return deleteResumeTokens(store, collectResumeTokens(session, token, resumeKey));
  };
};

type DeleteSessionOnSuccessInput<N extends RecipeName> = {
  session: ActiveResumeSession;
  token: unknown;
  resumeKey: string | undefined;
  outcome: MaybePromise<Outcome<ArtefactOf<N>>>;
};

const deleteSessionOnSuccess = <N extends RecipeName>(input: DeleteSessionOnSuccessInput<N>) => {
  const deleteResumeSession = createResumeDeletion<N>(input.session, input.token, input.resumeKey);
  return deleteResumeSession ? maybeTap(deleteResumeSession, input.outcome) : input.outcome;
};

type ContinueResumedPipelineInput<N extends RecipeName> = {
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
  };
  resumeOptions: ResumeOptions;
  resumeDiagnostics: DiagnosticEntry[];
  resumeRuntime: Runtime | undefined;
  resumeDiagnosticsMode: "default" | "strict";
  finalize: FinalizeResult<Outcome<ArtefactOf<N>>>;
};

const continueResumedPipeline = <N extends RecipeName>(input: ContinueResumedPipelineInput<N>) =>
  runResumedPipeline({
    deps: input.resumeDeps,
    resumeOptions: input.resumeOptions,
    resumeDiagnostics: input.resumeDiagnostics,
    resumeRuntime: input.resumeRuntime,
    resumeDiagnosticsMode: input.resumeDiagnosticsMode,
    finalize: input.finalize,
  });

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
  const snapshot = updateResumeSnapshot({
    snapshot: input.snapshot,
    runOptions,
    context,
    reporter,
  });
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

type ResolveEffectiveAdaptersInput<N extends RecipeName> = {
  deps: ResumeHandlerDeps<N>;
  resolvedAdapters: AdapterBundle;
  resumeOptions: ResumeOptions;
  runtime: Runtime | undefined;
  resumeRuntime: Runtime | undefined;
};

const resolveEffectiveAdapters = <N extends RecipeName>(
  input: ResolveEffectiveAdaptersInput<N>,
) => {
  if (input.resumeOptions.providers) {
    return resolveAdaptersFromProviders(
      input.deps,
      input.resumeRuntime ?? input.runtime,
      input.resumeOptions.providers,
    );
  }
  return input.resolvedAdapters;
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
    return deleteSessionOnSuccess<N>({
      session: input.session,
      token: input.token,
      resumeKey: input.resumeKey,
      outcome,
    });
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
      return deleteSessionOnSuccess<N>({
        session: input.session,
        token: input.token,
        resumeKey: input.resumeKey,
        outcome,
      });
    }
  }

  const outcome = continueResumedPipeline<N>({
    resumeDeps,
    resumeOptions: input.resumeOptions,
    resumeDiagnostics: input.resumeDiagnostics,
    resumeRuntime: input.resumeRuntime,
    resumeDiagnosticsMode: input.resumeDiagnosticsMode,
    finalize,
  });
  return deleteSessionOnSuccess<N>({
    session: input.session,
    token: input.token,
    resumeKey: input.resumeKey,
    outcome,
  });
};

const runResumeWithResolvedAdapters = <N extends RecipeName>(input: ResumeExecution<N>) => {
  if (input.session.kind === "pause") {
    return runResumeWithAdapters(input, input.resolvedAdapters);
  }
  return maybeChain(
    bindFirst(runResumeWithAdapters<N>, input),
    resolveEffectiveAdapters<N>({
      deps: input.deps,
      resolvedAdapters: input.resolvedAdapters,
      resumeOptions: input.resumeOptions,
      runtime: input.runtime,
      resumeRuntime: input.resumeRuntime,
    }),
  );
};

const runResumeExecutor = <N extends RecipeName>(input: ResumeExecution<N>) =>
  runResumeWithResolvedAdapters(input);

type ExecuteResumePipelineInput<N extends RecipeName> = {
  resumeValue: unknown;
  session: ActiveResumeSession;
  resolvedAdapters: AdapterBundle;
  token: unknown;
  resumeKey: string | undefined;
  runtime: Runtime | undefined;
  diagnosticsMode: "default" | "strict";
  trace: TraceEvent[];
  deps: ResumeHandlerDeps<N>;
};

export const executeResumePipeline = <N extends RecipeName>(
  input: ExecuteResumePipelineInput<N>,
) => {
  const resumeDiagnostics: DiagnosticEntry[] = [];
  const resumeOptions = readResumeOptions(input.resumeValue, input.runtime, resumeDiagnostics);
  const resumeRuntime = resumeOptions.runtime;
  const resumeDiagnosticsMode = resumeRuntime?.diagnostics ?? input.diagnosticsMode;
  const resumeError = createResumeError<N>({
    trace: input.trace,
    diagnosticsMode: resumeDiagnosticsMode,
    readErrorDiagnostics: input.deps.readErrorDiagnostics,
    errorOutcome: input.deps.errorOutcome,
  });

  return maybeTry(
    resumeError,
    bindFirst(runResumeExecutor<N>, {
      deps: input.deps,
      resolvedAdapters: input.resolvedAdapters,
      resumeOptions,
      resumeDiagnostics,
      resumeRuntime,
      resumeDiagnosticsMode,
      runtime: input.runtime,
      trace: input.trace,
      session: input.session,
      token: input.token,
      resumeKey: input.resumeKey,
      pauseSessions: input.deps.pauseSessions,
      resumeError,
    }),
  );
};
