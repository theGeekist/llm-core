import type {
  ArtefactOf,
  RecipeName,
  ResumeInputOf,
  RunInputOf,
  Runtime,
  WorkflowRuntime,
} from "../types";
import {
  addTrace,
  createTraceDiagnostics,
  applyDiagnosticsMode,
  type TraceEvent,
} from "#shared/reporting";
import { bindFirst } from "#shared/fp";
import { maybeTry } from "#shared/maybe";
import type { ResumeHandlerDeps } from "#workflow/runtime/resume-types";
import { startResumePipeline } from "#workflow/runtime/resume-start";
import { readResumeTokenInput } from "#workflow/runtime/resume-helpers";

type ResumeHandlerErrorInput<N extends RecipeName> = {
  deps: ResumeHandlerDeps<N>;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
};

type PerformResumeInput<N extends RecipeName> = {
  token: unknown;
  resumeKey?: string;
  resumeInput?: ResumeInputOf<N>;
  runtime?: Runtime;
  pauseSession: ReturnType<ResumeHandlerDeps<N>["pauseSessions"]["get"]>;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  deps: ResumeHandlerDeps<N>;
};

const handleResumeHandlerError = <N extends RecipeName>(
  input: ResumeHandlerErrorInput<N>,
  error: unknown,
) =>
  input.deps.errorOutcome(
    error,
    input.trace,
    applyDiagnosticsMode(input.deps.readErrorDiagnostics(error), input.diagnosticsMode),
  );

export const createResumeHandler =
  <N extends RecipeName>(
    deps: ResumeHandlerDeps<N>,
  ): NonNullable<WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>["resume"]> =>
  (token: unknown, resumeInput?: ResumeInputOf<N>, runtime?: Runtime) => {
    const trace = createTraceDiagnostics().trace;
    addTrace({ trace }, "run.start", { recipe: deps.contractName, resume: true });
    const diagnosticsMode = runtime?.diagnostics ?? "default";
    const tokenInput = readResumeTokenInput(token);
    const pauseSession = deps.pauseSessions.get(tokenInput.token);
    const handleError = bindFirst(handleResumeHandlerError, {
      deps,
      trace,
      diagnosticsMode,
    });

    const performResume = bindFirst(performResumePipeline<N>, {
      token: tokenInput.token,
      resumeKey: tokenInput.resumeKey,
      resumeInput,
      runtime,
      pauseSession,
      trace,
      diagnosticsMode,
      deps,
    });

    return maybeTry(handleError, performResume);
  };

const performResumePipeline = <N extends RecipeName>(input: PerformResumeInput<N>) =>
  startResumePipeline({
    token: input.token,
    resumeKey: input.resumeKey,
    resumeInput: input.resumeInput,
    runtime: input.runtime,
    pauseSession: input.pauseSession,
    trace: input.trace,
    diagnosticsMode: input.diagnosticsMode,
    deps: input.deps,
  });
