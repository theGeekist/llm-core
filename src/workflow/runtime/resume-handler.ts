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
  resumeKey?: string;
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

type ResumeTokenEnvelope = {
  token?: unknown;
  resumeKey?: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readResumeTokenInput = (value: unknown): { token: unknown; resumeKey?: string } => {
  if (!isObject(value) || !("resumeKey" in value)) {
    return { token: value };
  }
  const typed = value as ResumeTokenEnvelope;
  const resumeKey = typeof typed.resumeKey === "string" ? typed.resumeKey : undefined;
  return { token: "token" in typed ? typed.token : value, resumeKey };
};

export const createResumeHandler =
  <N extends RecipeName>(
    deps: ResumeHandlerDeps<N>,
  ): NonNullable<WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>>["resume"]> =>
  (token: unknown, resumeInput?: ResumeInputOf<N>, runtime?: Runtime) => {
    const trace = createTrace();
    addTraceEvent(trace, "run.start", { recipe: deps.contractName, resume: true });
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
