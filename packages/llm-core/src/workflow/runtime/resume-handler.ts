import type { ArtefactOf, RecipeName, ResumeInputOf, RunInputOf, WorkflowRuntime } from "../types";
import {
  addTrace,
  createTraceDiagnostics,
  applyDiagnosticsMode,
  type TraceEvent,
} from "#shared/reporting";
import { bindFirst } from "#shared/fp";
import { maybeTap, maybeTry } from "#shared/maybe";
import type { ResumeHandlerDeps } from "#workflow/runtime/resume-types";
import { startResumePipeline } from "#workflow/runtime/resume-start";

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

type PauseSessionClaim = {
  inFlight: Set<unknown>;
  token: unknown;
};

const releasePauseSessionClaim = (claim: PauseSessionClaim) => claim.inFlight.delete(claim.token);

export const createResumeHandler = <N extends RecipeName>(deps: ResumeHandlerDeps<N>) => {
  const inFlightPauseSessions = new Set<unknown>();
  const resume: NonNullable<
    WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>["resume"]
  > = ({ token, resumeInput, runtime }) => {
    const trace = createTraceDiagnostics().trace;
    addTrace({ trace }, "run.start", { recipe: deps.contractName, resume: true });
    const diagnosticsMode = runtime?.diagnostics ?? "default";
    const handleError = bindFirst(handleResumeHandlerError, {
      deps,
      trace,
      diagnosticsMode,
    });
    if (inFlightPauseSessions.has(token)) {
      return handleError(new Error("Resume token is already in flight."));
    }

    const pauseSession = deps.pauseSessions.get(token);
    if (pauseSession) {
      inFlightPauseSessions.add(token);
    }

    const performResume = bindFirst(startResumePipeline<N>, {
      token,
      resumeInput,
      runtime,
      pauseSession,
      trace,
      diagnosticsMode,
      deps,
    });

    const outcome = maybeTry(handleError, performResume);
    return pauseSession
      ? maybeTap(
          bindFirst(releasePauseSessionClaim, {
            inFlight: inFlightPauseSessions,
            token,
          }),
          outcome,
        )
      : outcome;
  };
  return resume;
};
