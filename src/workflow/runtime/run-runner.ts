import type { AdapterBundle, AdapterDiagnostic } from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import { chainMaybe, tryMaybe } from "../../maybe";
import { attachAdapterContext, createAdapterContext } from "../adapter-context";
import type { DiagnosticEntry } from "../diagnostics";
import { applyDiagnosticsMode, createAdapterDiagnostic, hasErrorDiagnostics } from "../diagnostics";
import { createInvalidResumeDiagnostics } from "./resume-diagnostics";
import type { TraceEvent } from "../trace";
import type { PipelineWithExtensions, Runtime } from "../types";
import type { ExecutionIterator } from "../driver";

type AdapterResolution = {
  adapters: AdapterBundle;
  diagnostics: AdapterDiagnostic[];
  constructs: Record<string, unknown>;
};

type PipelineRunner = {
  run: PipelineWithExtensions["run"];
};

export type RunWorkflowDeps<TOutcome> = {
  pipeline: PipelineWithExtensions | PipelineRunner;
  extensionRegistration: MaybePromise<unknown>;
  resolveAdaptersForRun: (
    runtime?: Runtime,
    providers?: Record<string, string>,
  ) => MaybePromise<AdapterResolution>;
  toResolvedAdapters: (resolution: AdapterResolution) => AdapterBundle;
  readContractDiagnostics: (adapters: AdapterBundle) => DiagnosticEntry[];
  buildDiagnostics: DiagnosticEntry[];
  strictErrorMessage: string;
  toErrorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => TOutcome;
  finalize: (
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    trace: TraceEvent[],
    diagnosticsMode: "default" | "strict",
  ) => MaybePromise<TOutcome>;
  isExecutionIterator: (value: unknown) => value is ExecutionIterator;
  driveIterator: (
    iterator: ExecutionIterator,
    input: unknown,
    trace: TraceEvent[],
    getDiagnostics: () => DiagnosticEntry[],
    diagnosticsMode: "default" | "strict",
    finalize: (
      result: unknown,
      getDiagnostics: () => DiagnosticEntry[],
      trace: TraceEvent[],
      diagnosticsMode: "default" | "strict",
    ) => MaybePromise<TOutcome>,
    onError: (error: unknown) => MaybePromise<TOutcome>,
    onInvalidYield: (value: unknown) => MaybePromise<TOutcome>,
  ) => MaybePromise<TOutcome>;
};

export type RunWorkflowContext<TOutcome> = {
  input: unknown;
  runtime?: Runtime;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  handleError: (error: unknown) => MaybePromise<TOutcome>;
};

const createRunDiagnosticsGetter = (
  runtimeDiagnostics: DiagnosticEntry[],
  contextDiagnostics: DiagnosticEntry[],
) =>
  function getRunDiagnostics() {
    return runtimeDiagnostics.concat(contextDiagnostics);
  };

const runPipelineResult = <TOutcome>(
  deps: RunWorkflowDeps<TOutcome>,
  ctx: RunWorkflowContext<TOutcome>,
  runtimeDiagnostics: DiagnosticEntry[],
  contextDiagnostics: DiagnosticEntry[],
  result: unknown,
): MaybePromise<TOutcome> => {
  const getDiagnostics = createRunDiagnosticsGetter(runtimeDiagnostics, contextDiagnostics);
  const handleInvalidYield = (value: unknown) => {
    void value;
    const diagnostics = createInvalidResumeDiagnostics(
      deps.buildDiagnostics,
      ctx.diagnosticsMode,
      "Iterator yielded a non-paused value.",
      "resume.invalidYield",
    );
    return deps.toErrorOutcome(
      new Error("Iterator yielded a non-paused value."),
      ctx.trace,
      diagnostics,
    );
  };
  if (deps.isExecutionIterator(result)) {
    return deps.driveIterator(
      result,
      undefined,
      ctx.trace,
      getDiagnostics,
      ctx.diagnosticsMode,
      deps.finalize,
      ctx.handleError,
      handleInvalidYield,
    );
  }
  return deps.finalize(result, getDiagnostics, ctx.trace, ctx.diagnosticsMode);
};

const runPipeline = <TOutcome>(
  deps: RunWorkflowDeps<TOutcome>,
  ctx: RunWorkflowContext<TOutcome>,
  resolution: AdapterResolution,
): MaybePromise<TOutcome> => {
  const resolvedAdapters = deps.toResolvedAdapters(resolution);
  const adapterContext = createAdapterContext();
  const adaptersWithContext = attachAdapterContext(resolvedAdapters, adapterContext.context);
  const adapterDiagnostics = resolution.diagnostics.map(createAdapterDiagnostic);
  const contractDiagnostics = deps.readContractDiagnostics(resolvedAdapters);
  const runtimeDiagnostics = adapterDiagnostics.concat(contractDiagnostics);
  const adjustedDiagnostics = applyDiagnosticsMode(runtimeDiagnostics, ctx.diagnosticsMode);
  if (ctx.diagnosticsMode === "strict" && hasErrorDiagnostics(adjustedDiagnostics)) {
    const diagnostics = applyDiagnosticsMode(
      [...deps.buildDiagnostics, ...runtimeDiagnostics],
      ctx.diagnosticsMode,
    );
    return deps.toErrorOutcome(new Error(deps.strictErrorMessage), ctx.trace, diagnostics);
  }
  return chainMaybe(
    deps.pipeline.run({
      input: ctx.input,
      runtime: ctx.runtime,
      reporter: ctx.runtime?.reporter,
      adapters: adaptersWithContext,
    }),
    createPipelineResultHandler(deps, ctx, runtimeDiagnostics, adapterContext.diagnostics),
  );
};

const createPipelineResultHandler = <TOutcome>(
  deps: RunWorkflowDeps<TOutcome>,
  ctx: RunWorkflowContext<TOutcome>,
  runtimeDiagnostics: DiagnosticEntry[],
  contextDiagnostics: DiagnosticEntry[],
) =>
  function handlePipelineResult(result: unknown) {
    return runPipelineResult(deps, ctx, runtimeDiagnostics, contextDiagnostics, result);
  };

const createPipelineHandler = <TOutcome>(
  deps: RunWorkflowDeps<TOutcome>,
  ctx: RunWorkflowContext<TOutcome>,
) =>
  function handleAdapters(resolution: AdapterResolution) {
    return runPipeline(deps, ctx, resolution);
  };

const runWithAdapters = <TOutcome>(
  deps: RunWorkflowDeps<TOutcome>,
  ctx: RunWorkflowContext<TOutcome>,
) => chainMaybe(deps.resolveAdaptersForRun(ctx.runtime), createPipelineHandler(deps, ctx));

const createAdapterRunHandler = <TOutcome>(
  deps: RunWorkflowDeps<TOutcome>,
  ctx: RunWorkflowContext<TOutcome>,
) =>
  function handleExtensionRegistration() {
    return runWithAdapters(deps, ctx);
  };

const runWithExtensions = <TOutcome>(
  deps: RunWorkflowDeps<TOutcome>,
  ctx: RunWorkflowContext<TOutcome>,
) => chainMaybe(deps.extensionRegistration, createAdapterRunHandler(deps, ctx));

export const runWorkflow = <TOutcome>(
  deps: RunWorkflowDeps<TOutcome>,
  ctx: RunWorkflowContext<TOutcome>,
) => {
  function handleExtensions() {
    return runWithExtensions(deps, ctx);
  }
  return tryMaybe(handleExtensions, ctx.handleError);
};
