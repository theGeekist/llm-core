import type {
  ArtefactOf,
  RecipeName,
  ResumeInputOf,
  RunInputOf,
  Runtime,
  WorkflowRuntime,
} from "../types";
import { addTraceEvent, createTrace } from "../trace";
import { bindFirst, maybeTry } from "../../maybe";
import type { ResumeHandlerDeps } from "./resume-types";
import { startResumePipeline } from "./resume-start";
import { applyDiagnosticsMode } from "../diagnostics";

type ResumeHandlerErrorInput<N extends RecipeName> = {
  deps: ResumeHandlerDeps<N>;
  trace: ReturnType<typeof createTrace>;
  diagnosticsMode: "default" | "strict";
};

type PerformResumeInput<N extends RecipeName> = {
  token: unknown;
  resumeInput?: ResumeInputOf<N>;
  runtime?: Runtime;
  pauseSession: ReturnType<ResumeHandlerDeps<N>["pauseSessions"]["get"]>;
  trace: ReturnType<typeof createTrace>;
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
    const trace = createTrace();
    addTraceEvent(trace, "run.start", { recipe: deps.contractName, resume: true });
    const diagnosticsMode = runtime?.diagnostics ?? "default";
    const pauseSession = deps.pauseSessions.get(token);
    const handleError = bindFirst(handleResumeHandlerError, {
      deps,
      trace,
      diagnosticsMode,
    });

    const performResume = bindFirst(performResumePipeline<N>, {
      token,
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
  startResumePipeline(
    input.token,
    input.resumeInput,
    input.runtime,
    input.pauseSession,
    input.trace,
    input.diagnosticsMode,
    input.deps,
  );
