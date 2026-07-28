import type { AdapterBundle, AdapterResumeResult } from "#adapters/types";
import { bindFirst } from "#shared/fp";
import { composeK, maybeChain, maybeMap } from "#shared/maybe";
import type { TraceEvent } from "#shared/reporting";
import type { PauseSession } from "../driver/types";
import { toPauseKind } from "../pause";
import type { RecipeName, ResumeInputOf, Runtime } from "../types";
import { executeResumePipeline } from "./resume-exec";
import { invalidResumeTokenOutcome, requireResumeAdapter } from "./resume-helpers";
import type { AdapterResolution, ResumeHandlerDeps } from "./resume-types";

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
  resolution: AdapterResolution;
};

type ResumeValueInput<N extends RecipeName> = {
  pauseSession: PauseSession;
  resolution: AdapterResolution;
  token: unknown;
  runtime: Runtime | undefined;
  diagnosticsMode: "default" | "strict";
  trace: TraceEvent[];
  deps: ResumeHandlerDeps<N>;
};

const readInterruptStrategy = (adapters: AdapterBundle) => adapters.interrupt;

const attachResolvedAdapters = <N extends RecipeName>(
  input: ResumeStartInput<N>,
  resolution: AdapterResolution,
) => ({
  ...input,
  resolution,
});

const resolveStartAdapters = <N extends RecipeName>(input: ResumeStartInput<N>) =>
  maybeMap(
    bindFirst(attachResolvedAdapters<N>, input),
    input.deps.resolveAdaptersForRun(input.runtime),
  );

const resumeFromSession = <N extends RecipeName>(input: ResumeStartResolvedInput<N>) => {
  const pauseSession = input.pauseSession;
  if (!pauseSession) {
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

  const resolvedAdapters = input.deps.toResolvedAdapters(input.resolution);
  const resumeValueInput: ResumeValueInput<N> = {
    pauseSession,
    resolution: input.resolution,
    token: input.token,
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
      pauseKind: toPauseKind(pauseSession.snapshot.pauseKind) ?? undefined,
      interrupt: readInterruptStrategy(resolvedAdapters),
      runtime: input.runtime,
      adapters: resolvedAdapters,
      declaredAdapters: input.deps.baseAdapters,
      providers: input.runtime?.providers,
    }),
  );
};

const handleResumeValue = <N extends RecipeName>(
  input: ResumeValueInput<N>,
  resumeValue: AdapterResumeResult,
) =>
  executeResumePipeline({
    resumeValue,
    pauseSession: input.pauseSession,
    resolution: input.resolution,
    token: input.token,
    runtime: input.runtime,
    diagnosticsMode: input.diagnosticsMode,
    trace: input.trace,
    deps: input.deps,
  });

const startResumeAfterExtensions = <N extends RecipeName>(
  input: ResumeStartInput<N>,
  _extensions: unknown,
) => {
  void _extensions;
  return composeK(resumeFromSession<N>, resolveStartAdapters<N>)(input);
};

const startResumeWithExtensions = <N extends RecipeName>(input: ResumeStartInput<N>) =>
  maybeChain(bindFirst(startResumeAfterExtensions, input), input.deps.extensionRegistration);

export const startResumePipeline = <N extends RecipeName>(input: ResumeStartInput<N>) =>
  startResumeWithExtensions(input);
