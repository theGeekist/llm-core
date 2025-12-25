import type {
  ArtefactOf,
  Outcome,
  RecipeName,
  RunInputOf,
  Runtime,
  WorkflowRuntime,
  PipelineWithExtensions,
} from "../types";
import type { AdapterBundle, AdapterDiagnostic } from "../../adapters/types";
import type { DiagnosticEntry } from "../diagnostics";
import type { TraceEvent } from "../trace";
import type { MaybePromise } from "../../maybe";
import { addTraceEvent, createTrace } from "../trace";
import { runWorkflow, type RunWorkflowContext } from "./run-runner";
import type { ExecutionIterator } from "../driver/types";
import type { DriveIteratorInput } from "../driver/iterator";
import { createRunErrorHandler } from "./outcomes";
import { applyDiagnosticsMode } from "../diagnostics";
import type { FinalizeResult } from "./helpers";

type AdapterResolution = {
  adapters: AdapterBundle;
  diagnostics: AdapterDiagnostic[];
  constructs: Record<string, unknown>;
};

type PipelineRunner = {
  run: PipelineWithExtensions["run"];
};

export type RunHandlerDeps<N extends RecipeName> = {
  contractName: string;
  pipeline: PipelineWithExtensions | PipelineRunner;
  extensionRegistration: MaybePromise<unknown>;
  resolveAdaptersForRun: (
    runtime?: Runtime,
    providers?: Record<string, string>,
  ) => MaybePromise<AdapterResolution>;
  toResolvedAdapters: (resolution: {
    adapters: AdapterBundle;
    constructs: Record<string, unknown>;
  }) => AdapterBundle;
  readContractDiagnostics: (adapters: AdapterBundle) => DiagnosticEntry[];
  buildDiagnostics: DiagnosticEntry[];
  strictErrorMessage: string;
  finalizeResult: FinalizeResult<Outcome<ArtefactOf<N>>>;
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[];
  isExecutionIterator: (value: unknown) => value is ExecutionIterator;
  driveIterator: (
    input: DriveIteratorInput<Outcome<ArtefactOf<N>>>,
  ) => MaybePromise<Outcome<ArtefactOf<N>>>;
};

export const createRunHandler =
  <N extends RecipeName>(
    deps: RunHandlerDeps<N>,
  ): WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>>["run"] =>
  (input: RunInputOf<N>, runtime?: Runtime) => {
    const trace = createTrace();
    addTraceEvent(trace, "run.start", { recipe: deps.contractName });
    const diagnosticsMode = runtime?.diagnostics ?? "default";
    const handleError = createRunErrorHandler(
      trace,
      diagnosticsMode,
      deps.readErrorDiagnostics,
      applyDiagnosticsMode,
      deps.errorOutcome,
    );
    const workflowDeps = {
      pipeline: deps.pipeline,
      extensionRegistration: deps.extensionRegistration,
      resolveAdaptersForRun: deps.resolveAdaptersForRun,
      toResolvedAdapters: deps.toResolvedAdapters,
      readContractDiagnostics: deps.readContractDiagnostics,
      buildDiagnostics: deps.buildDiagnostics,
      strictErrorMessage: deps.strictErrorMessage,
      toErrorOutcome: deps.errorOutcome,
      finalizeResult: deps.finalizeResult,
      isExecutionIterator: deps.isExecutionIterator,
      driveIterator: deps.driveIterator,
    };
    const ctx: RunWorkflowContext<Outcome<ArtefactOf<N>>> = {
      input,
      runtime,
      trace,
      diagnosticsMode,
      handleError,
    };
    return runWorkflow<Outcome<ArtefactOf<N>>>(workflowDeps, ctx);
  };
