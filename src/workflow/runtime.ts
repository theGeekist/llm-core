import type {
  ArtefactOf,
  ResumeInputOf,
  PipelineWithExtensions,
  RecipeName,
  RunInputOf,
  Runtime,
  RuntimeDeps,
  WorkflowRuntime,
} from "./types";
import type { AdapterBundle } from "../adapters/types";
import { createPipeline } from "./pipeline";
import {
  createPauseSessions,
  driveIterator,
  isExecutionIterator,
  recordPauseSession,
  type ExecutionIterator,
} from "./driver";
import { createContractView } from "./contract";
import { buildCapabilities } from "./capabilities";
import { buildExplainSnapshot } from "./explain";
import {
  createRequirementDiagnostic,
  applyDiagnosticsMode,
  hasErrorDiagnostics,
  normalizeDiagnostics,
  type DiagnosticEntry,
} from "./diagnostics";
import type { TraceEvent } from "./trace";
import { chainMaybe, mapMaybe } from "../maybe";
import type { MaybePromise } from "../maybe";
import {
  collectAdapters,
  createRegistryFromPlugins,
  resolveConstructRequirements,
} from "./adapters";
import { registerExtensions } from "./extensions";
import { createRunHandler } from "./runtime/run-handler";
import { createResumeHandler } from "./runtime/resume-handler";
import {
  applyAdapterOverrides,
  buildResolvedCapabilities,
  readContractDiagnostics,
  toResolvedAdapters,
} from "./runtime/adapters";
import {
  readArtifact,
  readPartialArtifact,
  toErrorOutcome,
  toOkOutcome,
  toPausedOutcome,
} from "./runtime/outcomes";

const STRICT_DIAGNOSTICS_ERROR = "Strict diagnostics failure.";

export const createRuntime = <N extends RecipeName>({
  contract,
  plugins,
  pipelineFactory,
}: RuntimeDeps<N>): WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>> => {
  const buildDiagnostics: DiagnosticEntry[] = [];
  const pipeline = pipelineFactory
    ? pipelineFactory(contract, plugins)
    : createPipeline(contract, plugins);
  const extensionRegistration =
    registerExtensions(
      pipeline as unknown as PipelineWithExtensions,
      plugins,
      contract.extensionPoints,
      buildDiagnostics,
    ) ?? [];
  const capabilitySnapshot = buildCapabilities(plugins);
  const declaredCapabilities = capabilitySnapshot.resolved;
  const baseAdapters = collectAdapters(plugins);
  const registry = createRegistryFromPlugins(plugins);
  const constructRequirements = resolveConstructRequirements(
    contract.minimumCapabilities,
    plugins,
    contract.constructs,
  );
  const defaultProviders = contract.constructs?.providers;
  const explain = buildExplainSnapshot({
    plugins,
    declaredCapabilities: capabilitySnapshot.declared,
    resolvedCapabilities: capabilitySnapshot.resolved,
  });
  for (const message of explain.missingRequirements ?? []) {
    buildDiagnostics.push(createRequirementDiagnostic(message));
  }
  const contractView = createContractView(contract);

  const readDiagnostics = (result: unknown) =>
    normalizeDiagnostics(
      buildDiagnostics,
      (result as { diagnostics?: unknown[] }).diagnostics ?? [],
    );

  const readErrorDiagnostics = (error: unknown) => {
    const diagnostics = (error as { diagnostics?: unknown[] }).diagnostics ?? [];
    return normalizeDiagnostics(buildDiagnostics, diagnostics);
  };
  const readArtefact = (result: unknown) => readArtifact<N>(result);
  const readPartial = (result: unknown) => readPartialArtifact<N>(result, readArtefact);
  const errorOutcome = (error: unknown, trace: TraceEvent[], diagnostics?: DiagnosticEntry[]) =>
    toErrorOutcome<N>(error, trace, diagnostics, readErrorDiagnostics);

  const resolveAdaptersForRun = (runtime?: Runtime, providers?: Record<string, string>) =>
    registry.resolve({
      constructs: constructRequirements,
      providers: providers ?? runtime?.providers,
      defaults: defaultProviders,
      reporter: runtime?.reporter,
    });
  const resolveAdaptersSnapshot = () =>
    mapMaybe(resolveAdaptersForRun(undefined), (resolution) => toResolvedAdapters(resolution));
  const resolveCapabilitiesSnapshot = (adapters: AdapterBundle) =>
    buildResolvedCapabilities(declaredCapabilities, adapters);

  const pauseSessions = createPauseSessions();
  const finalizeResult = (
    result: unknown,
    getDiagnostics: () => DiagnosticEntry[],
    trace: TraceEvent[],
    diagnosticsMode: "default" | "strict",
    iterator?: ExecutionIterator,
    recordSnapshot?: (result: unknown) => MaybePromise<void>,
  ) => {
    const diagnostics = applyDiagnosticsMode(
      readDiagnostics(result).concat(getDiagnostics()),
      diagnosticsMode,
    );
    if (diagnosticsMode === "strict" && hasErrorDiagnostics(diagnostics)) {
      return errorOutcome(new Error(STRICT_DIAGNOSTICS_ERROR), trace, diagnostics);
    }
    if ((result as { paused?: boolean }).paused) {
      recordPauseSession(pauseSessions, result, iterator, getDiagnostics);
      if (recordSnapshot) {
        return chainMaybe(recordSnapshot(result), () =>
          toPausedOutcome(result, trace, diagnostics, readPartial),
        );
      }
      return toPausedOutcome(result, trace, diagnostics, readPartial);
    }
    return toOkOutcome(result, trace, diagnostics, readArtefact);
  };

  const run = createRunHandler<N>({
    contractName: contract.name,
    pipeline,
    extensionRegistration,
    resolveAdaptersForRun,
    toResolvedAdapters,
    readContractDiagnostics: (adapters: AdapterBundle) =>
      readContractDiagnostics(declaredCapabilities, contract, adapters),
    buildDiagnostics,
    strictErrorMessage: STRICT_DIAGNOSTICS_ERROR,
    finalizeResult,
    errorOutcome,
    readErrorDiagnostics,
    isExecutionIterator,
    driveIterator,
  });

  const resume =
    contract.supportsResume === true
      ? createResumeHandler<N>({
          contractName: contract.name,
          extensionRegistration,
          pipeline,
          resolveAdaptersForRun,
          toResolvedAdapters,
          applyAdapterOverrides,
          readContractDiagnostics: (adapters: AdapterBundle) =>
            readContractDiagnostics(declaredCapabilities, contract, adapters),
          buildDiagnostics,
          strictErrorMessage: STRICT_DIAGNOSTICS_ERROR,
          readErrorDiagnostics,
          errorOutcome,
          finalizeResult,
          baseAdapters,
          pauseSessions,
        })
      : undefined;

  function capabilities() {
    return mapMaybe(resolveAdaptersSnapshot(), resolveCapabilitiesSnapshot);
  }

  function declaredAdapterBundle() {
    return baseAdapters;
  }

  function declaredCapabilitiesSnapshot() {
    return declaredCapabilities;
  }

  function adapterBundle() {
    return resolveAdaptersSnapshot();
  }

  function explainSnapshot() {
    return explain;
  }

  return {
    run,
    resume,
    capabilities,
    adapters: adapterBundle,
    declaredAdapters: declaredAdapterBundle,
    explain: explainSnapshot,
    contract: contractView,
    declaredCapabilities: declaredCapabilitiesSnapshot,
  };
};
