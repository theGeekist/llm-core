// References: docs/implementation-plan.md#L34-L37,L108-L114; docs/workflow-notes.md

import { isPromiseLike, maybeAll, type PipelineReporter } from "@wpkernel/pipeline/core";
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
import { createContractView } from "./contract";
import { buildCapabilities } from "./capabilities";
import { isCapabilitySatisfied } from "./capability-checks";
import { buildExplainSnapshot } from "./explain";
import {
  createLifecycleDiagnostic,
  createContractDiagnostic,
  createRequirementDiagnostic,
  createResumeDiagnostic,
  applyDiagnosticsMode,
  hasErrorDiagnostics,
  normalizeDiagnostics,
  type DiagnosticEntry,
} from "./diagnostics";
import { getEffectivePlugins } from "./plugins/effective";
import { addTraceEvent, createTrace, type TraceEvent } from "./trace";
import { chainMaybe, tryMaybe } from "./maybe";
import { collectAdapters } from "./adapters";

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

const DEFAULT_LIFECYCLE = "init";

const createLifecycleMessage = (plugin: Plugin, reason: string) =>
  `Plugin "${plugin.key}" extension skipped (${reason}).`;

const createDefaultReporter = (): PipelineReporter => ({
  warn: (message, context) => console.warn(message, context),
});

const hasExtensions = (pipeline: PipelineWithExtensions) =>
  !!pipeline.extensions && typeof pipeline.extensions.use === "function";

const trackMaybePromise = (pending: Promise<unknown>[], value: unknown) => {
  if (isPromiseLike(value)) {
    pending.push(Promise.resolve(value));
  }
};

const isLifecycleScheduled = (lifecycleSet: Set<string>, lifecycle: string) =>
  lifecycleSet.has(lifecycle);

const describeMissingLifecycle = (lifecycle: string) =>
  lifecycle === DEFAULT_LIFECYCLE
    ? `default lifecycle "${DEFAULT_LIFECYCLE}" not scheduled`
    : `lifecycle "${lifecycle}" not scheduled`;

const registerPluginExtension = (
  pipeline: PipelineWithExtensions,
  plugin: Plugin,
  lifecycleSet: Set<string>,
  diagnostics: DiagnosticEntry[],
  pending: Promise<unknown>[],
) => {
  if (plugin.lifecycle && !isLifecycleScheduled(lifecycleSet, plugin.lifecycle)) {
    diagnostics.push(
      createLifecycleDiagnostic(
        createLifecycleMessage(plugin, `lifecycle "${plugin.lifecycle}" not scheduled`),
      ),
    );
  }
  trackMaybePromise(
    pending,
    pipeline.extensions.use({
      key: plugin.key,
      register: plugin.register as never,
    }),
  );
};

const registerHookExtension = (
  pipeline: PipelineWithExtensions,
  plugin: Plugin,
  lifecycleSet: Set<string>,
  diagnostics: DiagnosticEntry[],
  pending: Promise<unknown>[],
) => {
  const lifecycle = plugin.lifecycle ?? DEFAULT_LIFECYCLE;
  if (!isLifecycleScheduled(lifecycleSet, lifecycle)) {
    diagnostics.push(
      createLifecycleDiagnostic(
        createLifecycleMessage(plugin, describeMissingLifecycle(lifecycle)),
      ),
    );
    return;
  }
  const register = makeHookRegister(lifecycle, plugin.hook);
  trackMaybePromise(pending, pipeline.extensions.use({ key: plugin.key, register }));
};

const makeHookRegister = (lifecycle: string, hook: Plugin["hook"]) =>
  function registerHook() {
    return {
      lifecycle,
      hook: hook as never,
    };
  };

const registerExtensions = (
  pipeline: PipelineWithExtensions,
  plugins: Plugin[],
  extensionPoints: string[],
  diagnostics: DiagnosticEntry[],
) => {
  if (!hasExtensions(pipeline)) {
    diagnostics.push(
      createLifecycleDiagnostic("Pipeline extensions unavailable; plugin extensions skipped."),
    );
    return;
  }

  const effectivePlugins = getEffectivePlugins(plugins);
  const lifecycleSet = new Set(extensionPoints);
  const pending: Promise<unknown>[] = [];

  for (const plugin of effectivePlugins) {
    if (plugin.register) {
      registerPluginExtension(pipeline, plugin, lifecycleSet, diagnostics, pending);
      continue;
    }
    if (!plugin.hook) {
      continue;
    }
    registerHookExtension(pipeline, plugin, lifecycleSet, diagnostics, pending);
  }

  return maybeAll(pending);
};

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
  const { declared, resolved } = buildCapabilities(plugins);
  const adapters = collectAdapters(plugins);
  const explain = buildExplainSnapshot({
    plugins,
    declaredCapabilities: declared,
    resolvedCapabilities: resolved,
  });
  for (const message of explain.missingRequirements ?? []) {
    buildDiagnostics.push(createRequirementDiagnostic(message));
  }
  for (const minimum of contract.minimumCapabilities) {
    if (!isCapabilitySatisfied(resolved[minimum])) {
      buildDiagnostics.push(
        createContractDiagnostic(`Recipe "${contract.name}" requires capability "${minimum}".`),
      );
    }
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

  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  const resumeEnvelopeKeys = new Set(["input", "runtime", "adapters"]);
  const hasOnlyResumeKeys = (value: Record<string, unknown>) =>
    Object.keys(value).every((key) => resumeEnvelopeKeys.has(key));
  const isResumeEnvelope = (value: Record<string, unknown>) =>
    "input" in value && hasOnlyResumeKeys(value);

  const readResumeOptions = (
    value: unknown,
    runtime?: Runtime,
    diagnostics?: DiagnosticEntry[],
  ) => {
    if (isObject(value) && isResumeEnvelope(value)) {
      const typed = value as { input?: unknown; runtime?: Runtime; adapters?: unknown };
      return {
        input: typed.input,
        runtime: typed.runtime ?? runtime,
        adapters: typed.adapters ?? adapters,
      };
    }
    if (isObject(value)) {
      if ("input" in value) {
        diagnostics?.push(
          createResumeDiagnostic(
            "Resume adapter returned an object with extra keys; treating it as input.",
          ),
        );
      } else {
        diagnostics?.push(
          createResumeDiagnostic(
            "Resume adapter returned an object without an input; treating it as input.",
          ),
        );
      }
    }
    return { input: value, runtime, adapters };
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
      return toErrorOutcome(new Error("Strict diagnostics failure."), trace, diagnostics);
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
      return chainMaybe(runPipeline(), handlers.handleResult);
    }

    function runPipeline() {
      return pipeline.run({ input, runtime, reporter: runtime?.reporter, adapters });
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
            return chainMaybe(
              adapter.resolve({ token, humanInput, runtime, adapters }),
              runResumePipeline,
            );
          }

          function runResumePipeline(resumeValue: unknown) {
            const resumeDiagnostics: DiagnosticEntry[] = [];
            const resumeOptions = readResumeOptions(resumeValue, runtime, resumeDiagnostics);
            const resumeRuntime = resumeOptions.runtime;
            const resumeDiagnosticsMode = resumeRuntime?.diagnostics ?? diagnosticsMode;
            return tryMaybe(
              () =>
                chainMaybe(
                  pipeline.run({
                    input: resumeOptions.input,
                    runtime: resumeRuntime,
                    reporter: resumeRuntime?.reporter,
                    adapters: resumeOptions.adapters,
                  }),
                  (result) =>
                    finalizeResult(
                      result,
                      normalizeDiagnostics(resumeDiagnostics, []),
                      trace,
                      resumeDiagnosticsMode,
                    ),
                ),
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
    return resolved;
  }

  function adapterBundle() {
    return adapters;
  }

  function explainSnapshot() {
    return explain;
  }

  return {
    run,
    resume,
    capabilities,
    adapters: adapterBundle,
    explain: explainSnapshot,
    contract: contractView,
  };
};
