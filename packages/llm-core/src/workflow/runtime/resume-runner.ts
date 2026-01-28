import type { MaybePromise } from "#shared/maybe";
import { bindFirst } from "#shared/fp";
import { maybeChain } from "#shared/maybe";
import { attachAdapterContext, createAdapterContext } from "../adapter-context";
import { createAdapterDiagnostic, hasErrorDiagnostics } from "#shared/diagnostics";
import type { DiagnosticEntry } from "#shared/reporting";
import type { ResumeOptions } from "../resume";
import type { TraceEvent } from "#shared/reporting";
import type { Outcome, PipelineWithExtensions, Runtime } from "../types";
import type { AdapterBundle } from "#adapters/types";
import { normalizeDiagnostics } from "#shared/diagnostics";
import { applyDiagnosticsMode } from "#shared/reporting";
import { createDiagnosticsGetter } from "./helpers";
import { createFinalizeWithInterrupt } from "./pause-metadata";
import type { FinalizeResult } from "./helpers";

import type { AdapterResolution, PipelineRunner, ResumeFinalizeInput } from "./resume-types";

export type ResumedPipelineDeps<TArtefact> = {
  pipeline: PipelineWithExtensions | PipelineRunner;
  resolveAdaptersForRun: (
    runtime?: Runtime,
    providers?: Record<string, string>,
  ) => MaybePromise<AdapterResolution>;
  applyAdapterOverrides: (resolved: AdapterBundle, overrides?: AdapterBundle) => AdapterBundle;
  toResolvedAdapters: (resolution: AdapterResolution) => AdapterBundle;
  readContractDiagnostics: (adapters: AdapterBundle) => DiagnosticEntry[];
  buildDiagnostics: DiagnosticEntry[];
  strictErrorMessage: string;
  trace: TraceEvent[];
  toErrorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<TArtefact>;
};

type RunResumedPipelineInput<TArtefact> = {
  deps: ResumedPipelineDeps<TArtefact>;
  resumeOptions: ResumeOptions;
  resumeDiagnostics: DiagnosticEntry[];
  resumeRuntime: Runtime | undefined;
  resumeDiagnosticsMode: "default" | "strict";
  finalize: FinalizeResult<Outcome<TArtefact>>;
};

export const runResumedPipeline = <TArtefact>(input: RunResumedPipelineInput<TArtefact>) => {
  const handleResolution = bindFirst(handleResumeResolution<TArtefact>, {
    deps: input.deps,
    resumeOptions: input.resumeOptions,
    resumeDiagnostics: input.resumeDiagnostics,
    resumeRuntime: input.resumeRuntime,
    resumeDiagnosticsMode: input.resumeDiagnosticsMode,
    finalize: input.finalize,
  });
  return maybeChain(
    handleResolution,
    input.deps.resolveAdaptersForRun(input.resumeRuntime, input.resumeOptions.providers),
  );
};

type ResumeResolutionInput<TArtefact> = {
  deps: ResumedPipelineDeps<TArtefact>;
  resumeOptions: ResumeOptions;
  resumeDiagnostics: DiagnosticEntry[];
  resumeRuntime: Runtime | undefined;
  resumeDiagnosticsMode: "default" | "strict";
  finalize: FinalizeResult<Outcome<TArtefact>>;
};

const handleResumeResolution = <TArtefact>(
  input: ResumeResolutionInput<TArtefact>,
  resolution: AdapterResolution,
) => {
  const resolvedAdapters = input.deps.toResolvedAdapters(resolution);
  const mergedAdapters = input.deps.applyAdapterOverrides(
    resolvedAdapters,
    input.resumeOptions.adapters,
  );
  const adapterContext = createAdapterContext();
  const adaptersWithContext = attachAdapterContext(mergedAdapters, adapterContext.context, {
    retryDefaults: input.resumeRuntime?.retryDefaults,
    retry: input.resumeRuntime?.retry,
    trace: input.deps.trace,
  });
  const adapterDiagnostics = resolution.diagnostics.map((d) => createAdapterDiagnostic(d));
  const contractDiagnostics = input.deps.readContractDiagnostics(mergedAdapters);
  const runtimeDiagnostics = adapterDiagnostics.concat(contractDiagnostics);
  if (
    input.resumeDiagnosticsMode === "strict" &&
    hasErrorDiagnostics(applyDiagnosticsMode(runtimeDiagnostics, input.resumeDiagnosticsMode))
  ) {
    const diagnostics = applyDiagnosticsMode(
      [
        ...input.deps.buildDiagnostics,
        ...normalizeDiagnostics(input.resumeDiagnostics, []),
        ...runtimeDiagnostics,
      ],
      input.resumeDiagnosticsMode,
    );
    return input.deps.toErrorOutcome(
      new Error(input.deps.strictErrorMessage),
      input.deps.trace,
      diagnostics,
    );
  }
  const resumeExtraDiagnostics = normalizeDiagnostics(input.resumeDiagnostics, []);
  const adjustedDiagnostics = applyDiagnosticsMode(runtimeDiagnostics, input.resumeDiagnosticsMode);
  const getDiagnostics = createDiagnosticsGetter([
    adjustedDiagnostics,
    adapterContext.diagnostics,
    resumeExtraDiagnostics,
  ]);
  const finalizeWithInterrupt = createFinalizeWithInterrupt(
    input.finalize,
    mergedAdapters.interrupt,
  );
  return maybeChain(
    bindFirst(handleResumeFinalize<TArtefact>, {
      finalize: finalizeWithInterrupt,
      getDiagnostics,
      trace: input.deps.trace,
      diagnosticsMode: input.resumeDiagnosticsMode,
    }),
    input.deps.pipeline.run({
      input: input.resumeOptions.input,
      runtime: input.resumeRuntime,
      reporter: input.resumeRuntime?.reporter,
      adapters: adaptersWithContext,
    }),
  );
};

const handleResumeFinalize = <TArtefact>(
  input: ResumeFinalizeInput<Outcome<TArtefact>>,
  result: unknown,
) =>
  input.finalize({
    result,
    getDiagnostics: input.getDiagnostics,
    trace: input.trace,
    diagnosticsMode: input.diagnosticsMode,
  });
