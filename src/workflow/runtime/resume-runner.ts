import type { AdapterBundle, AdapterDiagnostic } from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import { bindFirst, chainMaybe } from "../../maybe";
import { attachAdapterContext, createAdapterContext } from "../adapter-context";
import {
  applyDiagnosticsMode,
  createAdapterDiagnostic,
  hasErrorDiagnostics,
  normalizeDiagnostics,
  type DiagnosticEntry,
} from "../diagnostics";
import type { ResumeOptions } from "../resume";
import type { TraceEvent } from "../trace";
import type { Outcome, PipelineWithExtensions, Runtime } from "../types";
import { createDiagnosticsGetter } from "./helpers";
import { createFinalizeWithInterrupt } from "./pause-metadata";

type AdapterResolution = {
  adapters: AdapterBundle;
  diagnostics: AdapterDiagnostic[];
  constructs: Record<string, unknown>;
};

type PipelineRunner = {
  run: PipelineWithExtensions["run"];
};

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

export const runResumedPipeline = <TArtefact>(
  deps: ResumedPipelineDeps<TArtefact>,
  resumeOptions: ResumeOptions,
  resumeDiagnostics: DiagnosticEntry[],
  resumeRuntime: Runtime | undefined,
  resumeDiagnosticsMode: "default" | "strict",
  finalize: (
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    trace: TraceEvent[],
    diagnosticsMode: "default" | "strict",
  ) => MaybePromise<Outcome<TArtefact>>,
) => {
  const handleResolution = bindFirst(handleResumeResolution<TArtefact>, {
    deps,
    resumeOptions,
    resumeDiagnostics,
    resumeRuntime,
    resumeDiagnosticsMode,
    finalize,
  });
  return chainMaybe(
    deps.resolveAdaptersForRun(resumeRuntime, resumeOptions.providers),
    handleResolution,
  );
};

type ResumeResolutionInput<TArtefact> = {
  deps: ResumedPipelineDeps<TArtefact>;
  resumeOptions: ResumeOptions;
  resumeDiagnostics: DiagnosticEntry[];
  resumeRuntime: Runtime | undefined;
  resumeDiagnosticsMode: "default" | "strict";
  finalize: (
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    trace: TraceEvent[],
    diagnosticsMode: "default" | "strict",
  ) => MaybePromise<Outcome<TArtefact>>;
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
  const adaptersWithContext = attachAdapterContext(mergedAdapters, adapterContext.context);
  const adapterDiagnostics = resolution.diagnostics.map(createAdapterDiagnostic);
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
  const getDiagnostics = createDiagnosticsGetter([
    runtimeDiagnostics,
    adapterContext.diagnostics,
    resumeExtraDiagnostics,
  ]);
  const finalizeWithInterrupt = createFinalizeWithInterrupt(
    input.finalize,
    mergedAdapters.interrupt,
  );
  return chainMaybe(
    input.deps.pipeline.run({
      input: input.resumeOptions.input,
      runtime: input.resumeRuntime,
      reporter: input.resumeRuntime?.reporter,
      adapters: adaptersWithContext,
    }),
    bindFirst(handleResumeFinalize<TArtefact>, {
      finalize: finalizeWithInterrupt,
      getDiagnostics,
      trace: input.deps.trace,
      diagnosticsMode: input.resumeDiagnosticsMode,
    }),
  );
};

type ResumeFinalizeInput<TArtefact> = {
  finalize: (
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    trace: TraceEvent[],
    diagnosticsMode: "default" | "strict",
  ) => MaybePromise<Outcome<TArtefact>>;
  getDiagnostics: () => DiagnosticEntry[];
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
};

const handleResumeFinalize = <TArtefact>(input: ResumeFinalizeInput<TArtefact>, result: unknown) =>
  input.finalize(result, input.getDiagnostics, input.trace, input.diagnosticsMode);
