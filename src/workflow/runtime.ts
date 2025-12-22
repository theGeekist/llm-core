// References: docs/implementation-plan.md#L34-L37,L108-L114; docs/workflow-notes.md
import { type PipelineReporter } from "@wpkernel/pipeline/core";
import { makePipeline } from "@wpkernel/pipeline/core";
import type {
  ArtefactOf,
  HumanInputOf,
  Outcome,
  PipelineContext,
  PipelineState,
  PipelineWithExtensions,
  RunOptions,
  RecipeContract,
  RecipeName,
  RunInputOf,
  Runtime,
  RuntimeDeps,
  WorkflowRuntime,
  Plugin,
} from "./types";
import type { AdapterBundle, AdapterDiagnostic } from "../adapters/types";
import { createContractView } from "./contract";
import { applyAdapterPresence, buildCapabilities } from "./capabilities";
import { isCapabilitySatisfied } from "./capability-checks";
import { buildExplainSnapshot } from "./explain";
import {
  createContractDiagnostic,
  createRequirementDiagnostic,
  createResumeDiagnostic,
  createAdapterDiagnostic,
  applyDiagnosticsMode,
  hasErrorDiagnostics,
  normalizeDiagnostics,
  type DiagnosticEntry,
} from "./diagnostics";
import { getEffectivePlugins } from "./plugins/effective";
import { addTraceEvent, createTrace, type TraceEvent } from "./trace";
import { chainMaybe, mapMaybe, tryMaybe } from "../maybe";
import {
  collectAdapters,
  createRegistryFromPlugins,
  resolveConstructRequirements,
} from "./adapters";
import { readResumeOptions } from "./resume";
import { createDefaultReporter, registerExtensions } from "./extensions";

const collectHelperKinds = (contract: RecipeContract, plugins: Plugin[]) => {
  const kinds = new Set(contract.helperKinds ?? []);
  const effectivePlugins = getEffectivePlugins(plugins);
  for (const plugin of effectivePlugins) {
    for (const kind of plugin.helperKinds ?? []) {
      kinds.add(kind);
    }
  }
  return Array.from(kinds);
};

const STRICT_DIAGNOSTICS_ERROR = "Strict diagnostics failure.";

const createPipeline = (contract: RecipeContract, plugins: Plugin[]) =>
  makePipeline<RunOptions, PipelineContext, PipelineReporter, PipelineState>({
    helperKinds: collectHelperKinds(contract, plugins),
    createContext,
    createState,
    createStages: makeCreateStages(contract, plugins),
  });

function createContext(options: RunOptions): PipelineContext {
  return {
    reporter: options.reporter ?? createDefaultReporter(),
    runtime: options.runtime,
    adapters: options.adapters,
  };
}

function createState(): PipelineState {
  return {};
}

const makeCreateStages = (contract: RecipeContract, plugins: Plugin[]) =>
  function createStages(deps: unknown) {
    const stageDeps = deps as {
      makeLifecycleStage: (name: string) => unknown;
      makeHelperStage: (kind: string) => unknown;
      finalizeResult: unknown;
    };
    const lifecycles = contract.extensionPoints.map((name) => stageDeps.makeLifecycleStage(name));
    const helperStages = collectHelperKinds(contract, plugins).map((kind) =>
      stageDeps.makeHelperStage(kind),
    );
    return [...lifecycles, ...helperStages, stageDeps.finalizeResult];
  };

export const createRuntime = <N extends RecipeName>({
  contract,
  plugins,
  pipelineFactory,
}: RuntimeDeps<N>): WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, HumanInputOf<N>> => {
  const buildDiagnostics: DiagnosticEntry[] = [];
  const pipeline = pipelineFactory
    ? pipelineFactory(contract, plugins)
    : createPipeline(contract, plugins);
  const extensionRegistration = registerExtensions(
    pipeline as unknown as PipelineWithExtensions,
    plugins,
    contract.extensionPoints,
    buildDiagnostics,
  );
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

  const readArtifact = (result: unknown) =>
    ((result as { artifact?: PipelineState }).artifact ?? {}) as ArtefactOf<N>;

  const toOkOutcome = (
    result: unknown,
    trace: TraceEvent[],
    diagnostics: DiagnosticEntry[],
  ): Outcome<ArtefactOf<N>> => {
    addTraceEvent(trace, "run.ok");
    addTraceEvent(trace, "run.end", { status: "ok" });
    return {
      status: "ok",
      artefact: readArtifact(result),
      trace,
      diagnostics,
    };
  };

  const readPartialArtifact = (result: unknown) =>
    ((result as { partialArtifact?: Partial<ArtefactOf<N>> }).partialArtifact ??
      readArtifact(result)) as Partial<ArtefactOf<N>>;

  const resolveAdaptersForRun = (runtime?: Runtime, providers?: Record<string, string>) =>
    registry.resolve({
      constructs: constructRequirements,
      providers: providers ?? runtime?.providers,
      defaults: defaultProviders,
      reporter: runtime?.reporter,
    });

  const applyAdapterOverrides = (resolved: AdapterBundle, overrides?: AdapterBundle) => {
    if (!overrides) {
      return resolved;
    }
    return {
      ...resolved,
      ...overrides,
      constructs: {
        ...(resolved.constructs ?? {}),
        ...(overrides.constructs ?? {}),
      },
    };
  };

  const readContractDiagnostics = (adapters: AdapterBundle): DiagnosticEntry[] => {
    const runtimeCapabilities: Record<string, unknown> = { ...declaredCapabilities };
    applyAdapterPresence(runtimeCapabilities, adapters);
    return contract.minimumCapabilities.flatMap((minimum) =>
      isCapabilitySatisfied(runtimeCapabilities[minimum])
        ? []
        : [createContractDiagnostic(`Recipe "${contract.name}" requires capability "${minimum}".`)],
    );
  };

  const toResolvedAdapters = (resolution: {
    adapters: AdapterBundle;
    constructs: Record<string, unknown>;
  }): AdapterBundle => ({
    ...resolution.adapters,
    constructs: {
      ...(resolution.adapters.constructs ?? {}),
      ...resolution.constructs,
    },
  });

  const resolveAdaptersSnapshot = () =>
    mapMaybe(resolveAdaptersForRun(undefined), (resolution) => toResolvedAdapters(resolution));

  const buildResolvedCapabilities = (adapters: AdapterBundle) => {
    const runtimeCapabilities: Record<string, unknown> = { ...declaredCapabilities };
    applyAdapterPresence(runtimeCapabilities, adapters);
    return runtimeCapabilities;
  };

  const toNeedsHumanOutcome = (
    result: unknown,
    trace: TraceEvent[],
    diagnostics: DiagnosticEntry[],
  ): Outcome<ArtefactOf<N>> => {
    addTraceEvent(trace, "run.needsHuman");
    addTraceEvent(trace, "run.end", { status: "needsHuman" });
    return {
      status: "needsHuman",
      token: (result as { token?: unknown }).token,
      artefact: readPartialArtifact(result),
      trace,
      diagnostics,
    };
  };

  const finalizeResult = (
    result: unknown,
    extraDiagnostics: DiagnosticEntry[],
    trace: TraceEvent[],
    diagnosticsMode: "default" | "strict",
  ) => {
    const diagnostics = applyDiagnosticsMode(
      readDiagnostics(result).concat(extraDiagnostics),
      diagnosticsMode,
    );
    if (diagnosticsMode === "strict" && hasErrorDiagnostics(diagnostics)) {
      return toErrorOutcome(new Error(STRICT_DIAGNOSTICS_ERROR), trace, diagnostics);
    }
    const isNeedsHuman = (result as { needsHuman?: boolean }).needsHuman;
    if (isNeedsHuman) {
      return toNeedsHumanOutcome(result, trace, diagnostics);
    }
    return toOkOutcome(result, trace, diagnostics);
  };

  const createRunHandlers = (trace: TraceEvent[], diagnosticsMode: "default" | "strict") => {
    const handleResult = (result: unknown) => finalizeResult(result, [], trace, diagnosticsMode);

    const handleError = (error: unknown) =>
      toErrorOutcome(
        error,
        trace,
        applyDiagnosticsMode(readErrorDiagnostics(error), diagnosticsMode),
      );

    return { handleResult, handleError };
  };

  const toErrorOutcome = (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ): Outcome<ArtefactOf<N>> => {
    addTraceEvent(trace, "run.error", { error });
    addTraceEvent(trace, "run.end", { status: "error" });
    return {
      status: "error",
      error,
      trace,
      diagnostics: diagnostics ?? readErrorDiagnostics(error),
    };
  };

  function run(input: RunInputOf<N>, runtime?: Runtime) {
    const trace = createTrace();
    addTraceEvent(trace, "run.start", { recipe: contract.name });
    const diagnosticsMode = runtime?.diagnostics ?? "default";
    const handlers = createRunHandlers(trace, diagnosticsMode);
    return tryMaybe(performRun, handlers.handleError);

    function performRun() {
      return chainMaybe(extensionRegistration, runPipelineWithExtensions);
    }

    function runPipelineWithExtensions() {
      return chainMaybe(resolveAdaptersForRun(runtime), runPipeline);
    }

    function runPipeline(resolution: {
      adapters: AdapterBundle;
      diagnostics: AdapterDiagnostic[];
      constructs: Record<string, unknown>;
    }) {
      const resolvedAdapters = toResolvedAdapters(resolution);
      const adapterDiagnostics = resolution.diagnostics.map(createAdapterDiagnostic);
      const contractDiagnostics = readContractDiagnostics(resolvedAdapters);
      const runtimeDiagnostics = adapterDiagnostics.concat(contractDiagnostics);
      const adjustedDiagnostics = applyDiagnosticsMode(runtimeDiagnostics, diagnosticsMode);
      if (diagnosticsMode === "strict" && hasErrorDiagnostics(adjustedDiagnostics)) {
        const diagnostics = applyDiagnosticsMode(
          [...buildDiagnostics, ...runtimeDiagnostics],
          diagnosticsMode,
        );
        return toErrorOutcome(new Error(STRICT_DIAGNOSTICS_ERROR), trace, diagnostics);
      }
      return chainMaybe(
        pipeline.run({
          input,
          runtime,
          reporter: runtime?.reporter,
          adapters: resolvedAdapters,
        }),
        (result) => finalizeResult(result, runtimeDiagnostics, trace, diagnosticsMode),
      );
    }
  }

  const resume =
    contract.supportsResume === true
      ? function resume(token: unknown, humanInput?: HumanInputOf<N>, runtime?: Runtime) {
          const trace = createTrace();
          addTraceEvent(trace, "run.start", { recipe: contract.name, resume: true });
          const diagnosticsMode = runtime?.diagnostics ?? "default";
          const resumeAdapter = runtime?.resume;

          if (!resumeAdapter || typeof resumeAdapter.resolve !== "function") {
            const diagnostics = applyDiagnosticsMode(
              [...buildDiagnostics, createResumeDiagnostic("Resume requires a resume adapter.")],
              diagnosticsMode,
            );
            return toErrorOutcome(
              new Error("Resume requires a resume adapter."),
              trace,
              diagnostics,
            );
          }

          const adapter = resumeAdapter;
          const handlers = createRunHandlers(trace, diagnosticsMode);
          return tryMaybe(performResume, handlers.handleError);

          function performResume() {
            return chainMaybe(extensionRegistration, resolveResume);
          }

          function resolveResume() {
            return chainMaybe(resolveAdaptersForRun(runtime), (resolution) => {
              const resolvedAdapters = toResolvedAdapters(resolution);
              return chainMaybe(
                adapter.resolve({
                  token,
                  humanInput,
                  runtime,
                  adapters: resolvedAdapters,
                  declaredAdapters: baseAdapters,
                  providers: runtime?.providers,
                }),
                runResumePipeline,
              );
            });
          }

          function runResumePipeline(resumeValue: unknown) {
            const resumeDiagnostics: DiagnosticEntry[] = [];
            const resumeOptions = readResumeOptions(resumeValue, runtime, resumeDiagnostics);
            const resumeRuntime = resumeOptions.runtime;
            const resumeDiagnosticsMode = resumeRuntime?.diagnostics ?? diagnosticsMode;
            return tryMaybe(
              () => {
                return chainMaybe(
                  resolveAdaptersForRun(resumeRuntime, resumeOptions.providers),
                  (resolution) => {
                    const resolvedAdapters: AdapterBundle = {
                      ...resolution.adapters,
                      constructs: {
                        ...(resolution.adapters.constructs ?? {}),
                        ...resolution.constructs,
                      },
                    };
                    const adapterDiagnostics = resolution.diagnostics.map(createAdapterDiagnostic);
                    const mergedAdapters = applyAdapterOverrides(
                      resolvedAdapters,
                      resumeOptions.adapters,
                    );
                    const contractDiagnostics = readContractDiagnostics(mergedAdapters);
                    const runtimeDiagnostics = adapterDiagnostics.concat(contractDiagnostics);
                    if (
                      resumeDiagnosticsMode === "strict" &&
                      hasErrorDiagnostics(
                        applyDiagnosticsMode(runtimeDiagnostics, resumeDiagnosticsMode),
                      )
                    ) {
                      const diagnostics = applyDiagnosticsMode(
                        [
                          ...buildDiagnostics,
                          ...normalizeDiagnostics(resumeDiagnostics, []),
                          ...runtimeDiagnostics,
                        ],
                        resumeDiagnosticsMode,
                      );
                      return toErrorOutcome(
                        new Error(STRICT_DIAGNOSTICS_ERROR),
                        trace,
                        diagnostics,
                      );
                    }
                    const resumeExtraDiagnostics = normalizeDiagnostics(
                      resumeDiagnostics,
                      [],
                    ).concat(runtimeDiagnostics);
                    return chainMaybe(
                      pipeline.run({
                        input: resumeOptions.input,
                        runtime: resumeRuntime,
                        reporter: resumeRuntime?.reporter,
                        adapters: mergedAdapters,
                      }),
                      (result) =>
                        finalizeResult(
                          result,
                          resumeExtraDiagnostics,
                          trace,
                          resumeDiagnosticsMode,
                        ),
                    );
                  },
                );
              },
              (error) =>
                toErrorOutcome(
                  error,
                  trace,
                  applyDiagnosticsMode(readErrorDiagnostics(error), resumeDiagnosticsMode),
                ),
            );
          }
        }
      : undefined;

  function capabilities() {
    return mapMaybe(resolveAdaptersSnapshot(), buildResolvedCapabilities);
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
