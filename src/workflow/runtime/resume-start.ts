import type { ArtefactOf, Outcome, RecipeName, ResumeInputOf, Runtime } from "../types";
import type { AdapterBundle, PauseKind } from "../../adapters/types";
import type { TraceEvent } from "../trace";
import type { PauseSession } from "../driver/types";
import { bindFirst, maybeChain } from "../../maybe";
import {
  readSessionStore,
  resolveResumeSession,
  resolveSessionStore,
  type ResumeSession,
} from "./resume-session";
import { invalidResumeTokenOutcome, requireResumeAdapter } from "./resume-helpers";
import type { AdapterResolution, ResumeHandlerDeps } from "./resume-types";
import { executeResumePipeline, type ActiveResumeSession } from "./resume-exec";

type ResumeStartInput<N extends RecipeName> = {
  token: unknown;
  resumeInput: ResumeInputOf<N> | undefined;
  runtime: Runtime | undefined;
  pauseSession: PauseSession | undefined;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  deps: ResumeHandlerDeps<N>;
};

type ResumeStartResolvedInput<N extends RecipeName> = ResumeStartInput<N> & {
  resolvedAdapters: AdapterBundle;
};

type ResumeValueInput<N extends RecipeName> = {
  session: ActiveResumeSession;
  resolvedAdapters: AdapterBundle;
  token: unknown;
  runtime: Runtime | undefined;
  diagnosticsMode: "default" | "strict";
  trace: TraceEvent[];
  deps: ResumeHandlerDeps<N>;
};

const readPauseKind = (session: ActiveResumeSession): PauseKind | undefined =>
  session.kind === "iterator" ? session.session.pauseKind : session.snapshot.pauseKind;

const readInterruptStrategy = (adapters: AdapterBundle) => adapters.interrupt;

const handleVerifySnapshot = <N extends RecipeName>(
  input: ResumeStartInput<N>,
  snapshot: unknown,
) => {
  if (snapshot) {
    return undefined;
  }
  return invalidResumeTokenOutcome<N>(
    input.trace,
    input.diagnosticsMode,
    input.deps.buildDiagnostics,
    "Resume token is invalid or expired (checked via runtime store).",
    "resume.invalidToken",
    input.deps.errorOutcome,
  );
};

const startResumeAfterSession = <N extends RecipeName>(
  input: ResumeStartResolvedInput<N>,
  session: ResumeSession,
) =>
  resumeFromSession(
    session,
    input.resolvedAdapters,
    input.token,
    input.resumeInput,
    input.runtime,
    input.trace,
    input.diagnosticsMode,
    input.deps,
  );

const startResumeAfterAdapters = <N extends RecipeName>(
  input: ResumeStartInput<N>,
  resolution: AdapterResolution,
) => {
  const resolvedAdapters = input.deps.toResolvedAdapters(resolution);
  const store = resolveSessionStore(input.runtime, resolvedAdapters);
  const resumeInput: ResumeStartResolvedInput<N> = {
    ...input,
    resolvedAdapters,
  };
  return maybeChain(
    bindFirst(startResumeAfterSession, resumeInput),
    resolveResumeSession(input.token, input.pauseSession, store),
  );
};

const startResumeAfterExtensions = <N extends RecipeName>(
  input: ResumeStartInput<N>,
  _extensions: unknown,
) => {
  void _extensions;
  return maybeChain(
    bindFirst(startResumeAfterAdapters, input),
    input.deps.resolveAdaptersForRun(input.runtime),
  );
};

const startResumeAfterVerify = <N extends RecipeName>(
  input: ResumeStartInput<N>,
  earlyError: Outcome<ArtefactOf<N>> | undefined,
) => {
  if (earlyError) {
    return earlyError;
  }
  return maybeChain(bindFirst(startResumeAfterExtensions, input), input.deps.extensionRegistration);
};

const resumeFromSession = <N extends RecipeName>(
  session: ResumeSession,
  resolvedAdapters: AdapterBundle,
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

  const resumeValueInput: ResumeValueInput<N> = {
    session: session as ActiveResumeSession,
    resolvedAdapters,
    token,
    runtime,
    diagnosticsMode,
    trace,
    deps,
  };
  return maybeChain(
    bindFirst(handleResumeValue, resumeValueInput),
    required.adapter.resolve({
      token,
      resumeInput,
      pauseKind: readPauseKind(session as ActiveResumeSession),
      interrupt: readInterruptStrategy(resolvedAdapters),
      resumeSnapshot: session.kind === "snapshot" ? session.snapshot : undefined,
      runtime,
      adapters: resolvedAdapters,
      declaredAdapters: deps.baseAdapters,
      providers: runtime?.providers,
    }),
  );
};

const handleResumeValue = <N extends RecipeName>(
  input: ResumeValueInput<N>,
  resumeValue: unknown,
) =>
  executeResumePipeline(
    resumeValue,
    input.session,
    input.resolvedAdapters,
    input.token,
    input.runtime,
    input.diagnosticsMode,
    input.trace,
    input.deps,
  );

export const startResumePipeline = <N extends RecipeName>(
  token: unknown,
  resumeInput: ResumeInputOf<N> | undefined,
  runtime: Runtime | undefined,
  pauseSession: PauseSession | undefined,
  trace: TraceEvent[],
  diagnosticsMode: "default" | "strict",
  deps: ResumeHandlerDeps<N>,
) => {
  const input: ResumeStartInput<N> = {
    token,
    resumeInput,
    runtime,
    pauseSession,
    trace,
    diagnosticsMode,
    deps,
  };
  // Optimization: If a runtime session store is explicitly provided, check it first.
  // This avoids expensive adapter resolution for invalid tokens.
  const runtimeStore = readSessionStore(runtime);
  const verifyToken =
    runtimeStore && !pauseSession
      ? maybeChain(bindFirst(handleVerifySnapshot, input), runtimeStore.get(token))
      : undefined;
  return maybeChain(bindFirst(startResumeAfterVerify, input), verifyToken);
};
