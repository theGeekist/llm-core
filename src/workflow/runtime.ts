// References: docs/implementation-plan.md#L34-L37,L108-L114; docs/workflow-notes.md

import { makePipeline, maybeThen, maybeTry, type MaybePromise, type PipelineReporter } from "@wpkernel/pipeline";
import type { ExplainSnapshot } from "./explain";
import type {
  ArtefactOf,
  HumanInputOf,
  Outcome,
  Plugin,
  RecipeContract,
  RecipeName,
  RunInputOf,
  Runtime,
} from "./types";
import { createContractView } from "./contract";
import { buildCapabilities } from "./capabilities";
import { buildExplainSnapshot } from "./explain";
import { getEffectivePlugins } from "./plugins/effective";
import { addTraceEvent, createTrace, type TraceEvent } from "./trace";

type RuntimeDeps<N extends RecipeName> = {
  contract: RecipeContract & { name: N };
  plugins: Plugin[];
  pipelineFactory?: (
    contract: RecipeContract & { name: N },
    plugins: Plugin[]
  ) => ReturnType<typeof createPipeline>;
};

type RunOptions = {
  input: unknown;
  reporter?: PipelineReporter;
  runtime?: Runtime;
};

type PipelineContext = {
  reporter: PipelineReporter;
  runtime?: Runtime;
};

type PipelineState = Record<string, unknown>;


export type WorkflowRuntime<
  TRunInput = unknown,
  TArtefact = unknown,
  THumanInput = unknown,
> = {
  run: (input: TRunInput, runtime?: Runtime) => MaybePromise<Outcome<TArtefact>>;
  resume?: (
    token: unknown,
    humanInput?: THumanInput,
    runtime?: Runtime
  ) => MaybePromise<Outcome<TArtefact>>;
  capabilities: () => Record<string, unknown>;
  explain: () => ExplainSnapshot;
  contract: () => RecipeContract;
};

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

type PipelineWithExtensions = {
  extensions: {
    use: (extension: unknown) => unknown;
  };
};

const DEFAULT_LIFECYCLE = "init";

const createLifecycleDiagnostic = (plugin: Plugin, reason: string) =>
  `Plugin "${plugin.key}" extension skipped (${reason}).`;

const registerExtensions = (
  pipeline: PipelineWithExtensions,
  plugins: Plugin[],
  extensionPoints: string[],
  diagnostics: string[]
) => {
  const defaultLifecycle = DEFAULT_LIFECYCLE;
  const lifecycleSet = new Set(extensionPoints);

  for (const plugin of plugins) {
    if (plugin.register) {
      if (plugin.lifecycle && !lifecycleSet.has(plugin.lifecycle)) {
        diagnostics.push(
          createLifecycleDiagnostic(
            plugin,
            `lifecycle "${plugin.lifecycle}" not scheduled`
          )
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
      const reason = lifecycle === DEFAULT_LIFECYCLE
        ? `default lifecycle "${DEFAULT_LIFECYCLE}" not scheduled`
        : `lifecycle "${lifecycle}" not scheduled`;
      diagnostics.push(createLifecycleDiagnostic(plugin, reason));
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
      const lifecycles = contract.extensionPoints.map((name) =>
        stageDeps.makeLifecycleStage(name)
      );
      const helperStages = collectHelperKinds(contract, plugins).map((kind) =>
        stageDeps.makeHelperStage(kind)
      );
      return [...lifecycles, ...helperStages, stageDeps.finalizeResult];
    },
  });

export const createRuntime = <N extends RecipeName>({
  contract,
  plugins,
  pipelineFactory,
}: RuntimeDeps<N>): WorkflowRuntime<RunInputOf<N>, ArtefactOf<N>, HumanInputOf<N>> => {
  const buildDiagnostics: string[] = [];
  const pipeline = pipelineFactory
    ? pipelineFactory(contract, plugins)
    : createPipeline(contract, plugins);
  registerExtensions(
    pipeline as unknown as PipelineWithExtensions,
    plugins,
    contract.extensionPoints,
    buildDiagnostics
  );
  const { declared, resolved } = buildCapabilities(plugins);
  const explain = buildExplainSnapshot({
    plugins,
    declaredCapabilities: declared,
    resolvedCapabilities: resolved,
  });
  const contractView = createContractView(contract);

  const readDiagnostics = (result: unknown) => {
    const diagnostics = (result as { diagnostics?: unknown[] }).diagnostics ?? [];
    return [...buildDiagnostics, ...diagnostics];
  };

  const readErrorDiagnostics = (error: unknown) => {
    const diagnostics = (error as { diagnostics?: unknown[] }).diagnostics ?? [];
    return [...buildDiagnostics, ...diagnostics];
  };

  const readArtifact = (result: unknown) =>
    ((result as { artifact?: PipelineState }).artifact ?? {}) as ArtefactOf<N>;

  const toOkOutcome = (result: unknown, trace: TraceEvent[]): Outcome<ArtefactOf<N>> => {
    addTraceEvent(trace, "run.end", { status: "ok" });
    return {
      status: "ok",
      artefact: readArtifact(result),
      trace,
      diagnostics: readDiagnostics(result),
    };
  };

  const readPartialArtifact = (result: unknown) =>
    ((result as { partialArtifact?: Partial<ArtefactOf<N>> }).partialArtifact ??
      readArtifact(result)) as Partial<ArtefactOf<N>>;

  const toNeedsHumanOutcome = (
    result: unknown,
    trace: TraceEvent[]
  ): Outcome<ArtefactOf<N>> => {
    addTraceEvent(trace, "run.end", { status: "needsHuman" });
    return {
      status: "needsHuman",
      token: (result as { token?: unknown }).token,
      artefact: readPartialArtifact(result),
      trace,
      diagnostics: readDiagnostics(result),
    };
  };

  const toErrorOutcome = (error: unknown, trace: TraceEvent[]): Outcome<ArtefactOf<N>> => {
    addTraceEvent(trace, "run.end", { status: "error" });
    return {
      status: "error",
      error,
      trace,
      diagnostics: readErrorDiagnostics(error),
    };
  };

  const run = (input: RunInputOf<N>, runtime?: Runtime) => {
    const trace = createTrace();
    addTraceEvent(trace, "run.start", { recipe: contract.name });
    return maybeTry(
      () =>
        maybeThen(pipeline.run({ input, runtime, reporter: runtime?.reporter }), (result) => {
          const isNeedsHuman = (result as { needsHuman?: boolean }).needsHuman;
          if (isNeedsHuman) {
            addTraceEvent(trace, "run.needsHuman");
            return toNeedsHumanOutcome(result, trace);
          }
          addTraceEvent(trace, "run.ok");
          return toOkOutcome(result, trace);
        }),
      (error) => {
        addTraceEvent(trace, "run.error", { error });
        return toErrorOutcome(error, trace);
      }
    );
  };

  return {
    run,
    capabilities: () => resolved,
    explain: () => explain,
    contract: contractView,
  };
};
