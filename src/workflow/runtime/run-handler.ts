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
import { createSnapshotRecorder } from "./resume-session";
import { runWorkflow, type RunWorkflowContext } from "./run-runner";
import type { ExecutionIterator } from "../driver/types";
import type { IteratorFinalize } from "../driver/types";
import { createRunErrorHandler } from "./outcomes";
import { applyDiagnosticsMode } from "../diagnostics";

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
  finalizeResult: (
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    trace: TraceEvent[],
    diagnosticsMode: "default" | "strict",
    iterator?: ExecutionIterator,
    recordSnapshot?: (result: unknown) => MaybePromise<void>,
  ) => MaybePromise<Outcome<ArtefactOf<N>>>;
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[];
  isExecutionIterator: (value: unknown) => value is ExecutionIterator;
  driveIterator: (
    iterator: ExecutionIterator,
    input: unknown,
    trace: TraceEvent[],
    getDiagnostics: () => DiagnosticEntry[],
    diagnosticsMode: "default" | "strict",
    finalize: IteratorFinalize<Outcome<ArtefactOf<N>>>,
    onError: (error: unknown) => MaybePromise<Outcome<ArtefactOf<N>>>,
    onInvalidYield: (value: unknown) => MaybePromise<Outcome<ArtefactOf<N>>>,
  ) => MaybePromise<Outcome<ArtefactOf<N>>>;
};

const createFinalize = <N extends RecipeName>(
  finalizeResult: (
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    trace: TraceEvent[],
    diagnosticsMode: "default" | "strict",
    iterator?: ExecutionIterator,
    recordSnapshot?: (result: unknown) => MaybePromise<void>,
  ) => MaybePromise<Outcome<ArtefactOf<N>>>,
  recordSnapshot: (result: unknown) => MaybePromise<void>,
) =>
  function finalizeRunResult(
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    runtimeTrace: TraceEvent[],
    mode: "default" | "strict",
    iterator?: ExecutionIterator,
  ) {
    return finalizeResult(result, getDiagnostics, runtimeTrace, mode, iterator, recordSnapshot);
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
    const recordSnapshot = createSnapshotRecorder(runtime);
    const finalize = createFinalize<N>(deps.finalizeResult, recordSnapshot);
    const workflowDeps = {
      pipeline: deps.pipeline,
      extensionRegistration: deps.extensionRegistration,
      resolveAdaptersForRun: deps.resolveAdaptersForRun,
      toResolvedAdapters: deps.toResolvedAdapters,
      readContractDiagnostics: deps.readContractDiagnostics,
      buildDiagnostics: deps.buildDiagnostics,
      strictErrorMessage: deps.strictErrorMessage,
      toErrorOutcome: deps.errorOutcome,
      finalize,
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
