import type {
  ArtefactOf,
  Outcome,
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
import { createPauseSessions, recordPauseSession } from "./driver";
import type { PauseSession } from "./driver/types";
import { createContractView } from "./contract";
import { buildCapabilities } from "./capabilities";
import { buildExplainSnapshot } from "./explain";
import {
  createRequirementDiagnostic,
  applyDiagnosticsMode,
  hasErrorDiagnostics,
  normalizeDiagnostics,
  type DiagnosticEntry,
} from "../shared/diagnostics";
import type { TraceEvent } from "../shared/trace";
import { bindFirst } from "../shared/fp";
import { maybeChain, maybeMap } from "../shared/maybe";
import type { MaybePromise } from "../shared/maybe";
import type { FinalizeResultInput } from "./runtime/helpers";
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
  readArtefact,
  readPartialArtefact,
  readPauseFlag,
  toErrorOutcome,
  toOkOutcome,
  toPausedOutcome,
} from "./runtime/outcomes";
import { runPauseRollback } from "./runtime/rollback";

const STRICT_DIAGNOSTICS_ERROR = "Strict diagnostics failure.";

type ReadDiagnosticsInput = {
  buildDiagnostics: DiagnosticEntry[];
};

const readDiagnosticsFromResult = (input: ReadDiagnosticsInput, result: unknown) =>
  normalizeDiagnostics(
    input.buildDiagnostics,
    (result as { diagnostics?: unknown[] }).diagnostics ?? [],
  );

const readErrorDiagnosticsFromError = (input: ReadDiagnosticsInput, error: unknown) => {
  const diagnostics = (error as { diagnostics?: unknown[] }).diagnostics ?? [];
  return normalizeDiagnostics(input.buildDiagnostics, diagnostics);
};

const readArtefactFromResult = <N extends RecipeName>(result: unknown) => readArtefact<N>(result);

const readPartialFromResult = <N extends RecipeName>(
  readArtefactValue: (result: unknown) => ArtefactOf<N>,
  result: unknown,
) => readPartialArtefact<N>(result, readArtefactValue);

type ErrorOutcomeInput = {
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[];
};

type ErrorOutcomeWithDiagnosticsInput = {
  input: ErrorOutcomeInput;
  error: unknown;
  trace: TraceEvent[];
  diagnostics?: DiagnosticEntry[];
};

const toErrorOutcomeWithDiagnostics = <N extends RecipeName>(
  payload: ErrorOutcomeWithDiagnosticsInput,
) =>
  toErrorOutcome<N>({
    error: payload.error,
    trace: payload.trace,
    diagnostics: payload.diagnostics,
    readErrorDiagnostics: payload.input.readErrorDiagnostics,
  });

const createErrorOutcome = <N extends RecipeName>(
  readErrorDiagnostics: (error: unknown) => DiagnosticEntry[],
) =>
  function errorOutcome(error: unknown, trace: TraceEvent[], diagnostics?: DiagnosticEntry[]) {
    return toErrorOutcomeWithDiagnostics<N>({
      input: { readErrorDiagnostics },
      error,
      trace,
      diagnostics,
    });
  };

type FinalizeRuntimeInput<N extends RecipeName> = {
  readDiagnostics: (result: unknown) => DiagnosticEntry[];
  readPartial: (result: unknown) => Partial<ArtefactOf<N>>;
  readArtefact: (result: unknown) => ArtefactOf<N>;
  errorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => Outcome<ArtefactOf<N>>;
  pauseSessions: Map<unknown, PauseSession>;
};

type PausedOutcomeInput<N extends RecipeName> = {
  result: unknown;
  trace: TraceEvent[];
  diagnostics: DiagnosticEntry[];
  readPartial: (result: unknown) => Partial<ArtefactOf<N>>;
  recordSnapshot?: (result: unknown) => MaybePromise<boolean | null>;
};

const toPausedOutcomeAfterSnapshot = <N extends RecipeName>(input: PausedOutcomeInput<N>) =>
  toPausedOutcome({
    result: input.result,
    trace: input.trace,
    diagnostics: input.diagnostics,
    readPartial: input.readPartial,
  });

const finalizePausedSnapshot = <N extends RecipeName>(input: PausedOutcomeInput<N>) => {
  if (!input.recordSnapshot) {
    return toPausedOutcomeAfterSnapshot(input);
  }
  return maybeChain(
    bindFirst(toPausedOutcomeAfterSnapshot<N>, input),
    input.recordSnapshot(input.result),
  );
};

const runPausedRollback = <N extends RecipeName>(input: PausedOutcomeInput<N>) =>
  runPauseRollback(input.result);

const finalizePausedResult = <N extends RecipeName>(input: PausedOutcomeInput<N>) =>
  maybeChain(bindFirst(finalizePausedSnapshot<N>, input), runPausedRollback(input));

const finalizeRuntimeResult = <N extends RecipeName>(
  input: FinalizeRuntimeInput<N>,
  payload: FinalizeResultInput,
) => {
  const diagnostics = applyDiagnosticsMode(
    input.readDiagnostics(payload.result).concat(payload.getDiagnostics()),
    payload.diagnosticsMode,
  );
  if (payload.diagnosticsMode === "strict" && hasErrorDiagnostics(diagnostics)) {
    return input.errorOutcome(new Error(STRICT_DIAGNOSTICS_ERROR), payload.trace, diagnostics);
  }
  if (readPauseFlag(payload.result)) {
    recordPauseSession(input.pauseSessions, payload.result, payload.getDiagnostics);
    return finalizePausedResult<N>({
      result: payload.result,
      trace: payload.trace,
      diagnostics,
      readPartial: input.readPartial,
      recordSnapshot: payload.recordSnapshot,
    });
  }
  return toOkOutcome({
    result: payload.result,
    trace: payload.trace,
    diagnostics,
    readArtefactValue: input.readArtefact,
  });
};

type ResolveAdaptersInput = {
  registry: ReturnType<typeof createRegistryFromPlugins>;
  constructRequirements: ReturnType<typeof resolveConstructRequirements>;
  defaultProviders: Record<string, string> | undefined;
};

const resolveAdaptersForRunWithInput = (
  input: ResolveAdaptersInput,
  runtime?: Runtime,
  providers?: Record<string, string>,
) =>
  input.registry.resolve({
    constructs: input.constructRequirements,
    providers: providers ?? runtime?.providers,
    defaults: input.defaultProviders,
    reporter: runtime?.reporter,
  });

const createResolveAdaptersForRun = (input: ResolveAdaptersInput) =>
  bindFirst(resolveAdaptersForRunWithInput, input);

type AdapterResolution = {
  adapters: AdapterBundle;
  constructs: Record<string, unknown>;
};

const resolveAdaptersSnapshot = (
  resolveAdaptersForRun: (runtime?: Runtime) => MaybePromise<AdapterResolution>,
) => maybeMap(toResolvedAdapters, resolveAdaptersForRun(undefined));

const resolveCapabilitiesSnapshot = (
  declaredCapabilities: Record<string, unknown>,
  adapters: AdapterBundle,
) => buildResolvedCapabilities(declaredCapabilities, adapters);

type CapabilitiesInput = {
  resolveAdaptersSnapshotFn: () => MaybePromise<AdapterBundle>;
  resolveCapabilitiesSnapshotFn: (adapters: AdapterBundle) => Record<string, unknown>;
};

const getCapabilities = (input: CapabilitiesInput) =>
  maybeMap(input.resolveCapabilitiesSnapshotFn, input.resolveAdaptersSnapshotFn());

const createCapabilitiesGetter = (
  resolveAdaptersSnapshotFn: () => MaybePromise<AdapterBundle>,
  resolveCapabilitiesSnapshotFn: (adapters: AdapterBundle) => Record<string, unknown>,
) =>
  bindFirst(getCapabilities, {
    resolveAdaptersSnapshotFn,
    resolveCapabilitiesSnapshotFn,
  });

const getDeclaredAdapters = (baseAdapters: AdapterBundle) => baseAdapters;

const createDeclaredAdaptersGetter = (baseAdapters: AdapterBundle) =>
  bindFirst(getDeclaredAdapters, baseAdapters);

const getDeclaredCapabilities = (declaredCapabilities: Record<string, unknown>) =>
  declaredCapabilities;

const createDeclaredCapabilitiesGetter = (declaredCapabilities: Record<string, unknown>) =>
  bindFirst(getDeclaredCapabilities, declaredCapabilities);

const getAdapters = (resolveAdaptersSnapshotFn: () => MaybePromise<AdapterBundle>) =>
  resolveAdaptersSnapshotFn();

const createAdaptersGetter = (resolveAdaptersSnapshotFn: () => MaybePromise<AdapterBundle>) =>
  bindFirst(getAdapters, resolveAdaptersSnapshotFn);

const getExplain = (explain: ReturnType<typeof buildExplainSnapshot>) => explain;

const createExplainGetter = (explain: ReturnType<typeof buildExplainSnapshot>) =>
  bindFirst(getExplain, explain);

export const createRuntime = <N extends RecipeName>({
  contract,
  plugins,
  diagnostics,
  pipelineFactory,
}: RuntimeDeps<N>): WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, ResumeInputOf<N>> => {
  const buildDiagnostics: DiagnosticEntry[] = diagnostics ? [...diagnostics] : [];
  const pipeline = pipelineFactory
    ? pipelineFactory(contract, plugins)
    : createPipeline(contract, plugins);
  const pipelineRunner = pipeline as unknown as PipelineWithExtensions;
  const extensionRegistration =
    registerExtensions({
      pipeline: pipelineRunner,
      plugins,
      extensionPoints: contract.extensionPoints,
      diagnostics: buildDiagnostics,
    }) ?? [];
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

  const readDiagnostics = bindFirst(readDiagnosticsFromResult, { buildDiagnostics });
  const readErrorDiagnostics = bindFirst(readErrorDiagnosticsFromError, { buildDiagnostics });
  const readArtefact = readArtefactFromResult<N>;
  const readPartial = bindFirst(readPartialFromResult<N>, readArtefact);
  const errorOutcome = createErrorOutcome<N>(readErrorDiagnostics);

  const resolveAdaptersForRun = createResolveAdaptersForRun({
    registry,
    constructRequirements,
    defaultProviders,
  });
  const resolveAdaptersSnapshotFn = bindFirst(resolveAdaptersSnapshot, resolveAdaptersForRun);
  const resolveCapabilitiesSnapshotFn = bindFirst(
    resolveCapabilitiesSnapshot,
    declaredCapabilities,
  );

  const pauseSessions = createPauseSessions();
  const finalizeResult = bindFirst(finalizeRuntimeResult<N>, {
    readDiagnostics,
    readPartial,
    readArtefact,
    errorOutcome,
    pauseSessions,
  });

  const run = createRunHandler<N>({
    contractName: contract.name,
    pipeline: pipelineRunner,
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
  });

  const resume =
    contract.supportsResume === true
      ? createResumeHandler<N>({
          contractName: contract.name,
          extensionRegistration,
          pipeline: pipelineRunner,
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

  const capabilities = createCapabilitiesGetter(
    resolveAdaptersSnapshotFn,
    resolveCapabilitiesSnapshotFn,
  );
  const declaredAdapterBundle = createDeclaredAdaptersGetter(baseAdapters);
  const declaredCapabilitiesSnapshot = createDeclaredCapabilitiesGetter(declaredCapabilities);
  const adapterBundle = createAdaptersGetter(resolveAdaptersSnapshotFn);
  const explainSnapshot = createExplainGetter(explain);

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
