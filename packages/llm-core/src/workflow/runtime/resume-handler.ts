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

    const performResume = bindFirst(startResumePipeline<N>, {
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
