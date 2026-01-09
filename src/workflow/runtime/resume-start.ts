import type { ArtefactOf, Outcome, RecipeName, ResumeInputOf, Runtime } from "../types";
import type { AdapterBundle } from "../../adapters/types";
import type { TraceEvent } from "../../shared/trace";
import type { PauseSession } from "../driver/types";
import { bindFirst } from "../../shared/fp";
import { maybeChain } from "../../shared/maybe";
import {
  readSessionStore,
  resolveResumeSession,
  resolveSessionStore,
  type ResumeSession,
} from "./resume-session";
import {
  invalidResumeTokenOutcome,
  readPauseKindFromSession,
  readResumeTokenFromSession,
  requireResumeAdapter,
} from "./resume-helpers";
import type { AdapterResolution, ResumeHandlerDeps } from "./resume-types";
import { executeResumePipeline, type ActiveResumeSession } from "./resume-exec";

type ResumeStartInput<N extends RecipeName> = {
  token: unknown;
  resumeKey?: string;
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
  resumeKey?: string;
  runtime: Runtime | undefined;
  diagnosticsMode: "default" | "strict";
  trace: TraceEvent[];
  deps: ResumeHandlerDeps<N>;
};

const readInterruptStrategy = (adapters: AdapterBundle) => adapters.interrupt;

const handleVerifySnapshot = <N extends RecipeName>(
  input: ResumeStartInput<N>,
  snapshot: unknown,
) => {
  if (snapshot) {
    return null;
  }
  return invalidResumeTokenOutcome<N>({
    trace: input.trace,
    diagnosticsMode: input.diagnosticsMode,
    buildDiagnostics: input.deps.buildDiagnostics,
    message: "Resume token is invalid or expired (checked via runtime store).",
    code: "resume.invalidToken",
    errorOutcome: input.deps.errorOutcome,
  });
};

const startResumeAfterSession = <N extends RecipeName>(
  input: ResumeStartResolvedInput<N>,
  session: ResumeSession,
) =>
  resumeFromSession({
    session,
    resolvedAdapters: input.resolvedAdapters,
    token: readResumeTokenFromSession(session, input.token),
    resumeKey: input.resumeKey,
    resumeInput: input.resumeInput,
    runtime: input.runtime,
    trace: input.trace,
    diagnosticsMode: input.diagnosticsMode,
    deps: input.deps,
  });

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
    resolveResumeSession({
      token: input.token,
      resumeKey: input.resumeKey,
      session: input.pauseSession,
      store,
    }),
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
  earlyError: Outcome<ArtefactOf<N>> | undefined | null,
) => {
  if (earlyError) {
    return earlyError;
  }
  return maybeChain(bindFirst(startResumeAfterExtensions, input), input.deps.extensionRegistration);
};

type ResumeFromSessionInput<N extends RecipeName> = {
  session: ResumeSession;
  resolvedAdapters: AdapterBundle;
  token: unknown;
  resumeKey: string | undefined;
  resumeInput: ResumeInputOf<N> | undefined;
  runtime: Runtime | undefined;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  deps: ResumeHandlerDeps<N>;
};

const resumeFromSession = <N extends RecipeName>(input: ResumeFromSessionInput<N>) => {
  const { session } = input;
  if (session.kind === "invalid") {
    return invalidResumeTokenOutcome<N>({
      trace: input.trace,
      diagnosticsMode: input.diagnosticsMode,
      buildDiagnostics: input.deps.buildDiagnostics,
      message: "Resume token is invalid or expired.",
      code: "resume.invalidToken",
      errorOutcome: input.deps.errorOutcome,
    });
  }

  const required = requireResumeAdapter<N>({
    resumeAdapter: input.runtime?.resume,
    trace: input.trace,
    diagnosticsMode: input.diagnosticsMode,
    buildDiagnostics: input.deps.buildDiagnostics,
    errorOutcome: input.deps.errorOutcome,
  });
  if (!required.ok) {
    return required.outcome;
  }

  const resumeValueInput: ResumeValueInput<N> = {
    session: session as ActiveResumeSession,
    resolvedAdapters: input.resolvedAdapters,
    token: input.token,
    resumeKey: input.resumeKey,
    runtime: input.runtime,
    diagnosticsMode: input.diagnosticsMode,
    trace: input.trace,
    deps: input.deps,
  };
  return maybeChain(
    bindFirst(handleResumeValue, resumeValueInput),
    required.adapter.resolve({
      token: input.token,
      resumeInput: input.resumeInput,
      pauseKind: readPauseKindFromSession(session as ActiveResumeSession) ?? undefined,
      interrupt: readInterruptStrategy(input.resolvedAdapters),
      resumeKey: input.resumeKey,
      resumeSnapshot: session.kind === "snapshot" ? session.snapshot : undefined,
      runtime: input.runtime,
      adapters: input.resolvedAdapters,
      declaredAdapters: input.deps.baseAdapters,
      providers: input.runtime?.providers,
    }),
  );
};

const handleResumeValue = <N extends RecipeName>(
  input: ResumeValueInput<N>,
  resumeValue: unknown,
) =>
  executeResumePipeline({
    resumeValue,
    session: input.session,
    resolvedAdapters: input.resolvedAdapters,
    token: input.token,
    resumeKey: input.resumeKey,
    runtime: input.runtime,
    diagnosticsMode: input.diagnosticsMode,
    trace: input.trace,
    deps: input.deps,
  });

type StartResumePipelineInput<N extends RecipeName> = {
  token: unknown;
  resumeKey?: string;
  resumeInput: ResumeInputOf<N> | undefined;
  runtime: Runtime | undefined;
  pauseSession: PauseSession | undefined;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  deps: ResumeHandlerDeps<N>;
};

export const startResumePipeline = <N extends RecipeName>(input: StartResumePipelineInput<N>) => {
  // Optimization: If a runtime session store is explicitly provided, check it first.
  // This avoids expensive adapter resolution for invalid tokens.
  const runtimeStore = readSessionStore(input.runtime);
  const verifyKey = input.resumeKey ?? input.token;
  const verifyToken =
    runtimeStore && !input.pauseSession
      ? maybeChain(bindFirst(handleVerifySnapshot, input), runtimeStore.get(verifyKey))
      : undefined;
  return maybeChain(bindFirst(startResumeAfterVerify, input), verifyToken);
};
