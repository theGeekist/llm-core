import type { ArtefactOf, Outcome, PipelineWithExtensions, RecipeName, Runtime } from "../types";
import type { AdapterBundle } from "#adapters/types";
import type { DiagnosticEntry } from "#shared/reporting";
import type { TraceEvent } from "#shared/reporting";
import type { MaybePromise } from "#shared/maybe";
import type { PauseSession } from "../driver/types";
import type { FinalizeResult } from "./helpers";
import type { AdapterResolution } from "./pipeline-runner";

export type { AdapterResolution } from "./pipeline-runner";

export type PipelineRunner = {
  run: PipelineWithExtensions["run"];
  resume?: PipelineWithExtensions["resume"];
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
export type ResumeErrorInput<TOutcome> = {
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[];
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<TOutcome>;
};
