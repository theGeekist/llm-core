// References: docs/implementation-plan.md#L34-L37,L108-L114; docs/workflow-notes.md

import { maybeThen, maybeTry, type PipelineReporter } from "@wpkernel/pipeline/core";
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
import { buildExplainSnapshot } from "./explain";
import {
  createLifecycleDiagnostic,
  createContractDiagnostic,
  createRequirementDiagnostic,
  applyDiagnosticsMode,
  hasErrorDiagnostics,
  normalizeDiagnostics,
  type DiagnosticEntry,
} from "./diagnostics";
import { getEffectivePlugins } from "./plugins/effective";
import { addTraceEvent, createTrace, type TraceEvent } from "./trace";

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

const registerExtensions = (
  pipeline: PipelineWithExtensions,
  plugins: Plugin[],
  extensionPoints: string[],
  diagnostics: DiagnosticEntry[],
) => {
  const effectivePlugins = getEffectivePlugins(plugins);
  const defaultLifecycle = DEFAULT_LIFECYCLE;
  const lifecycleSet = new Set(extensionPoints);

  for (const plugin of effectivePlugins) {
    if (plugin.register) {
      if (plugin.lifecycle && !lifecycleSet.has(plugin.lifecycle)) {
        diagnostics.push(
          createLifecycleDiagnostic(
            createLifecycleMessage(plugin, `lifecycle "${plugin.lifecycle}" not scheduled`),
          ),
        );
      }
      pipeline.extensions.use({
        key: plugin.key,
        register: plugin.register as never,
      });
      continue;
    }

    if (!plugin.hook) {
      continue;
    }

    const lifecycle = plugin.lifecycle ?? defaultLifecycle;
    if (!lifecycleSet.has(lifecycle)) {
      const reason =
        lifecycle === DEFAULT_LIFECYCLE
          ? `default lifecycle "${DEFAULT_LIFECYCLE}" not scheduled`
          : `lifecycle "${lifecycle}" not scheduled`;
      diagnostics.push(createLifecycleDiagnostic(createLifecycleMessage(plugin, reason)));
      continue;
    }

    pipeline.extensions.use({
      key: plugin.key,
      register: () => ({
        lifecycle,
        hook: plugin.hook as never,
      }),
    });
  }
};

const createPipeline = (contract: RecipeContract, plugins: Plugin[]) =>
  makePipeline<RunOptions, PipelineContext, PipelineReporter, PipelineState>({
    helperKinds: collectHelperKinds(contract, plugins),
    createContext: (options) => ({
      reporter: options.reporter ?? {
        warn: (message, context) => console.warn(message, context),
      },
      runtime: options.runtime,
    }),
    createState: () => ({}),
    createStages: (deps) => {
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
    },
  });

export const createRuntime = <N extends RecipeName>({
  contract,
  plugins,
  pipelineFactory,
}: RuntimeDeps<N>): WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, HumanInputOf<N>> => {
  const buildDiagnostics: DiagnosticEntry[] = [];
  const pipeline = pipelineFactory
    ? pipelineFactory(contract, plugins)
    : createPipeline(contract, plugins);
  registerExtensions(
    pipeline as unknown as PipelineWithExtensions,
    plugins,
    contract.extensionPoints,
    buildDiagnostics,
  );
  const { declared, resolved } = buildCapabilities(plugins);
  const explain = buildExplainSnapshot({
    plugins,
    declaredCapabilities: declared,
    resolvedCapabilities: resolved,
  });
  for (const message of explain.missingRequirements ?? []) {
    buildDiagnostics.push(createRequirementDiagnostic(message));
  }
  for (const minimum of contract.minimumCapabilities) {
    if (!(minimum in resolved)) {
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

  const run = (input: RunInputOf<N>, runtime?: Runtime) => {
    const trace = createTrace();
    addTraceEvent(trace, "run.start", { recipe: contract.name });
    const diagnosticsMode = runtime?.diagnostics ?? "default";
    return maybeTry(
      () =>
        maybeThen(pipeline.run({ input, runtime, reporter: runtime?.reporter }), (result) => {
          const diagnostics = applyDiagnosticsMode(readDiagnostics(result), diagnosticsMode);
          if (diagnosticsMode === "strict" && hasErrorDiagnostics(diagnostics)) {
            return toErrorOutcome(new Error("Strict diagnostics failure."), trace, diagnostics);
          }
          const isNeedsHuman = (result as { needsHuman?: boolean }).needsHuman;
          if (isNeedsHuman) {
            return toNeedsHumanOutcome(result, trace, diagnostics);
          }
          return toOkOutcome(result, trace, diagnostics);
        }),
      (error) =>
        toErrorOutcome(
          error,
          trace,
          applyDiagnosticsMode(readErrorDiagnostics(error), diagnosticsMode),
        ),
    );
  };

  return {
    run,
    resume:
      contract.supportsResume === true
        ? (_token, _humanInput, runtime) => {
            void _token;
            void _humanInput;
            void runtime;
            const trace = createTrace();
            addTraceEvent(trace, "run.start", { recipe: contract.name, resume: true });
            const diagnostics = normalizeDiagnostics(buildDiagnostics, []);
            return toErrorOutcome(new Error("Resume is not implemented."), trace, diagnostics);
          }
        : undefined,
    capabilities: () => resolved,
    explain: () => explain,
    contract: contractView,
  };
};
