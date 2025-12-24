import type { AdapterBundle, AdapterDiagnostic } from "../../adapters/types";
import type { MaybePromise } from "../../maybe";
import { chainMaybe } from "../../maybe";
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
) =>
  chainMaybe(deps.resolveAdaptersForRun(resumeRuntime, resumeOptions.providers), (resolution) => {
    const resolvedAdapters: AdapterBundle = {
      ...resolution.adapters,
      constructs: {
        ...(resolution.adapters.constructs ?? {}),
        ...resolution.constructs,
      },
    };
    const mergedAdapters = deps.applyAdapterOverrides(resolvedAdapters, resumeOptions.adapters);
    const adapterContext = createAdapterContext();
    const adaptersWithContext = attachAdapterContext(mergedAdapters, adapterContext.context);
    const adapterDiagnostics = resolution.diagnostics.map(createAdapterDiagnostic);
    const contractDiagnostics = deps.readContractDiagnostics(mergedAdapters);
    const runtimeDiagnostics = adapterDiagnostics.concat(contractDiagnostics);
    if (
      resumeDiagnosticsMode === "strict" &&
      hasErrorDiagnostics(applyDiagnosticsMode(runtimeDiagnostics, resumeDiagnosticsMode))
    ) {
      const diagnostics = applyDiagnosticsMode(
        [
          ...deps.buildDiagnostics,
          ...normalizeDiagnostics(resumeDiagnostics, []),
          ...runtimeDiagnostics,
        ],
        resumeDiagnosticsMode,
      );
      return deps.toErrorOutcome(new Error(deps.strictErrorMessage), deps.trace, diagnostics);
    }
    const resumeExtraDiagnostics = normalizeDiagnostics(resumeDiagnostics, []);
    const getDiagnostics = function getResumeRunDiagnostics() {
      return runtimeDiagnostics.concat(adapterContext.diagnostics).concat(resumeExtraDiagnostics);
    };
    return chainMaybe(
      deps.pipeline.run({
        input: resumeOptions.input,
        runtime: resumeRuntime,
        reporter: resumeRuntime?.reporter,
        adapters: adaptersWithContext,
      }),
      (result) => finalize(result, getDiagnostics, deps.trace, resumeDiagnosticsMode),
    );
  });
