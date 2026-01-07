import type { AdapterBundle, AdapterDiagnostic } from "../../adapters/types";
import type { MaybePromise } from "../../shared/maybe";
import { bindFirst, maybeChain, curryK, maybeTry } from "../../shared/maybe";
import { attachAdapterContext, createAdapterContext } from "../adapter-context";
import type { DiagnosticEntry } from "../../shared/diagnostics";
import {
  applyDiagnosticsMode,
  createAdapterDiagnostic,
  hasErrorDiagnostics,
} from "../../shared/diagnostics";
import type { TraceEvent } from "../../shared/trace";
import type { PipelineWithExtensions, Runtime } from "../types";
import { createSnapshotRecorder, resolveSessionStore } from "./resume-session";
import { createDiagnosticsGetter, createFinalize, type FinalizeResult } from "./helpers";
import { createFinalizeWithInterrupt } from "./pause-metadata";

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
  finalizeResult: FinalizeResult<TOutcome>;
};

export type RunWorkflowContext<TOutcome> = {
  input: unknown;
  runtime?: Runtime;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  handleError: (error: unknown) => MaybePromise<TOutcome>;
};

type RunContext<TOutcome> = {
  deps: RunWorkflowDeps<TOutcome>;
  ctx: RunWorkflowContext<TOutcome>;
};

type RunPipelineInput<TOutcome> = {
  context: RunContext<TOutcome>;
  runtimeDiagnostics: DiagnosticEntry[];
  contextDiagnostics: DiagnosticEntry[];
  finalize: FinalizeResult<TOutcome>;
};

type RunPipelineResultInput<TOutcome> = {
  context: RunContext<TOutcome>;
  runtimeDiagnostics: DiagnosticEntry[];
  contextDiagnostics: DiagnosticEntry[];
  result: unknown;
  finalize: FinalizeResult<TOutcome>;
};

const runPipelineResult = <TOutcome>(
  input: RunPipelineResultInput<TOutcome>,
): MaybePromise<TOutcome> => {
  const getDiagnostics = createDiagnosticsGetter([
    input.runtimeDiagnostics,
    input.contextDiagnostics,
  ]);
  return input.finalize({
    result: input.result,
    getDiagnostics,
    trace: input.context.ctx.trace,
    diagnosticsMode: input.context.ctx.diagnosticsMode,
  });
};

const runPipeline = <TOutcome>(
  context: RunContext<TOutcome>,
  resolution: AdapterResolution,
): MaybePromise<TOutcome> => {
  const resolvedAdapters = context.deps.toResolvedAdapters(resolution);
  const adapterContext = createAdapterContext();
  const adaptersWithContext = attachAdapterContext(resolvedAdapters, adapterContext.context, {
    retryDefaults: context.ctx.runtime?.retryDefaults,
    retry: context.ctx.runtime?.retry,
    trace: context.ctx.trace,
  });
  const adapterDiagnostics = resolution.diagnostics.map(createAdapterDiagnostic);
  const contractDiagnostics = context.deps.readContractDiagnostics(resolvedAdapters);
  const runtimeDiagnostics = adapterDiagnostics.concat(contractDiagnostics);
  const adjustedDiagnostics = applyDiagnosticsMode(runtimeDiagnostics, context.ctx.diagnosticsMode);
  if (context.ctx.diagnosticsMode === "strict" && hasErrorDiagnostics(adjustedDiagnostics)) {
    const diagnostics = applyDiagnosticsMode(
      [...context.deps.buildDiagnostics, ...runtimeDiagnostics],
      context.ctx.diagnosticsMode,
    );
    return context.deps.toErrorOutcome(
      new Error(context.deps.strictErrorMessage),
      context.ctx.trace,
      diagnostics,
    );
  }
  const store = resolveSessionStore(context.ctx.runtime, resolvedAdapters);
  const recordSnapshot = createSnapshotRecorder(store, context.ctx.runtime);
  const finalize = createFinalizeWithInterrupt(
    createFinalize(context.deps.finalizeResult, recordSnapshot),
    resolvedAdapters.interrupt,
  );
  const handleResult = bindFirst(handlePipelineResult<TOutcome>, {
    context,
    runtimeDiagnostics,
    contextDiagnostics: adapterContext.diagnostics,
    finalize,
  });
  return maybeChain(
    handleResult,
    context.deps.pipeline.run({
      input: context.ctx.input,
      runtime: context.ctx.runtime,
      reporter: context.ctx.runtime?.reporter,
      adapters: adaptersWithContext,
    }),
  );
};

const handlePipelineResult = <TOutcome>(input: RunPipelineInput<TOutcome>, result: unknown) =>
  runPipelineResult({
    context: input.context,
    runtimeDiagnostics: input.runtimeDiagnostics,
    contextDiagnostics: input.contextDiagnostics,
    result,
    finalize: input.finalize,
  });

const runWithAdapters = <TOutcome>(context: RunContext<TOutcome>) =>
  maybeChain(
    curryK(handleAdapters<TOutcome>)(context),
    context.deps.resolveAdaptersForRun(context.ctx.runtime),
  );

const handleAdapters = <TOutcome>(context: RunContext<TOutcome>, resolution: AdapterResolution) =>
  runPipeline(context, resolution);

const runWithExtensions = <TOutcome>(context: RunContext<TOutcome>) =>
  maybeChain(
    curryK(handleExtensionRegistration<TOutcome>)(context),
    context.deps.extensionRegistration,
  );

const handleExtensionRegistration = <TOutcome>(
  context: RunContext<TOutcome>,
  _extensions: unknown,
) => {
  void _extensions;
  return runWithAdapters(context);
};

export const runWorkflow = <TOutcome>(
  deps: RunWorkflowDeps<TOutcome>,
  ctx: RunWorkflowContext<TOutcome>,
) => {
  const context: RunContext<TOutcome> = { deps, ctx };
  return maybeTry(ctx.handleError, bindFirst(runWithExtensions<TOutcome>, context));
};
