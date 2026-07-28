import type { AdapterBundle } from "#adapters/types";
import { bindFirst } from "#shared/fp";
import { maybeChain, maybeTry, type MaybePromise } from "#shared/maybe";
import type { DiagnosticEntry, TraceEvent } from "#shared/reporting";
import type { PipelineWithExtensions, Runtime } from "../types";
import type { FinalizeResult } from "./helpers";
import { createRuntimeFinalize } from "./pause-metadata";
import { executePipelineResolution, type AdapterResolution } from "./pipeline-runner";

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

const createRunFinalize = <TOutcome>(context: RunContext<TOutcome>, adapters: AdapterBundle) =>
  createRuntimeFinalize({
    finalizeResult: context.deps.finalizeResult,
    interrupt: adapters.interrupt,
  });

const runPipelineResolution = <TOutcome>(
  context: RunContext<TOutcome>,
  resolution: AdapterResolution,
) =>
  executePipelineResolution({
    deps: context.deps,
    resolution,
    selectAdapters: context.deps.toResolvedAdapters,
    input: context.ctx.input,
    runtime: context.ctx.runtime,
    trace: context.ctx.trace,
    diagnosticsMode: context.ctx.diagnosticsMode,
    createFinalize: bindFirst(createRunFinalize<TOutcome>, context),
  });

const runWithAdapters = <TOutcome>(context: RunContext<TOutcome>) =>
  maybeChain(
    bindFirst(runPipelineResolution<TOutcome>, context),
    context.deps.resolveAdaptersForRun(context.ctx.runtime),
  );

const runAfterExtensions = <TOutcome>(context: RunContext<TOutcome>, _extensions: unknown) => {
  void _extensions;
  return runWithAdapters(context);
};

const runWithExtensions = <TOutcome>(context: RunContext<TOutcome>) =>
  maybeChain(bindFirst(runAfterExtensions<TOutcome>, context), context.deps.extensionRegistration);

export const runWorkflow = <TOutcome>(
  deps: RunWorkflowDeps<TOutcome>,
  ctx: RunWorkflowContext<TOutcome>,
) => {
  const context: RunContext<TOutcome> = { deps, ctx };
  return maybeTry(ctx.handleError, bindFirst(runWithExtensions<TOutcome>, context));
};
