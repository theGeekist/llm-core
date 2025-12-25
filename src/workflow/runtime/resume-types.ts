import type { ArtefactOf, Outcome, PipelineWithExtensions, RecipeName, Runtime } from "../types";
import type { AdapterBundle, AdapterDiagnostic } from "../../adapters/types";
import type { DiagnosticEntry } from "../diagnostics";
import type { TraceEvent } from "../trace";
import type { MaybePromise } from "../../maybe";
import type { PauseSession } from "../driver/types";
import type { FinalizeResult } from "./helpers";

export type AdapterResolution = {
  adapters: AdapterBundle;
  diagnostics: AdapterDiagnostic[];
  constructs: Record<string, unknown>;
};

export type PipelineRunner = {
  run: PipelineWithExtensions["run"];
};

export type ResumeHandlerDeps<N extends RecipeName> = {
  contractName: string;
  extensionRegistration: MaybePromise<unknown>;
  resolveAdaptersForRun: (
    runtime?: Runtime,
    providers?: Record<string, string>,
  ) => MaybePromise<AdapterResolution>;
  toResolvedAdapters: (resolution: {
    adapters: AdapterBundle;
    constructs: Record<string, unknown>;
  }) => AdapterBundle;
  applyAdapterOverrides: (resolved: AdapterBundle, overrides?: AdapterBundle) => AdapterBundle;
  readContractDiagnostics: (adapters: AdapterBundle) => DiagnosticEntry[];
  buildDiagnostics: DiagnosticEntry[];
  strictErrorMessage: string;
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[];
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
  finalizeResult: FinalizeResult<Outcome<ArtefactOf<N>>>;
  baseAdapters: AdapterBundle;
  pauseSessions: Map<unknown, PauseSession>;
  pipeline: PipelineWithExtensions | PipelineRunner;
};
