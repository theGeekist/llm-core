import type { AdapterBundle, AdapterDiagnostic } from "#adapters/types";
import { createAdapterDiagnostic, hasErrorDiagnostics } from "#shared/diagnostics";
import { maybeChain, type MaybePromise } from "#shared/maybe";
import { applyDiagnosticsMode, type DiagnosticEntry, type TraceEvent } from "#shared/reporting";
import { attachAdapterContext, createAdapterContext } from "../adapter-context";
import type { PipelineWithExtensions, Runtime } from "../types";
import { createDiagnosticsGetter, createResultFinalizer, type FinalizeResult } from "./helpers";

export type AdapterResolution = {
  adapters: AdapterBundle;
  diagnostics: AdapterDiagnostic[];
  constructs: Record<string, unknown>;
};

type PipelineExecutionDeps<TOutcome> = {
  pipeline: Pick<PipelineWithExtensions, "run">;
  readContractDiagnostics: (adapters: AdapterBundle) => DiagnosticEntry[];
  buildDiagnostics: DiagnosticEntry[];
  strictErrorMessage: string;
  toErrorOutcome: (
    error: unknown,
    trace: TraceEvent[],
    diagnostics?: DiagnosticEntry[],
  ) => TOutcome;
};

type PipelineExecutionInput<TOutcome> = {
  deps: PipelineExecutionDeps<TOutcome>;
  resolution: AdapterResolution;
  selectAdapters: (resolution: AdapterResolution) => AdapterBundle;
  input: unknown;
  runtime?: Runtime;
  trace: TraceEvent[];
  diagnosticsMode: "default" | "strict";
  strictDiagnostics?: DiagnosticEntry[];
  extraDiagnostics?: DiagnosticEntry[];
  createFinalize: (adapters: AdapterBundle) => FinalizeResult<TOutcome>;
  execute?: (input: {
    adapters: AdapterBundle;
    adaptersWithContext: AdapterBundle;
  }) => MaybePromise<unknown>;
};

const executePipeline = <TOutcome>(
  input: PipelineExecutionInput<TOutcome>,
  adapters: AdapterBundle,
  adaptersWithContext: AdapterBundle,
) =>
  input.execute
    ? input.execute({ adapters, adaptersWithContext })
    : input.deps.pipeline.run({
        input: input.input,
        runtime: input.runtime,
        reporter: input.runtime?.reporter,
        adapters: adaptersWithContext,
      });

export const executePipelineResolution = <TOutcome>(
  input: PipelineExecutionInput<TOutcome>,
): MaybePromise<TOutcome> => {
  const adapters = input.selectAdapters(input.resolution);
  const adapterContext = createAdapterContext();
  const adaptersWithContext = attachAdapterContext({
    adapters,
    context: adapterContext.context,
    retryDefaults: input.runtime?.retryDefaults,
    retry: input.runtime?.retry,
    trace: input.trace,
  });
  const adapterDiagnostics = input.resolution.diagnostics.map((diagnostic) =>
    createAdapterDiagnostic(diagnostic),
  );
  const runtimeDiagnostics = adapterDiagnostics.concat(
    input.deps.readContractDiagnostics(adapters),
  );
  const adjustedDiagnostics = applyDiagnosticsMode(runtimeDiagnostics, input.diagnosticsMode);

  if (input.diagnosticsMode === "strict" && hasErrorDiagnostics(adjustedDiagnostics)) {
    const diagnostics = applyDiagnosticsMode(
      [...input.deps.buildDiagnostics, ...(input.strictDiagnostics ?? []), ...runtimeDiagnostics],
      input.diagnosticsMode,
    );
    return input.deps.toErrorOutcome(
      new Error(input.deps.strictErrorMessage),
      input.trace,
      diagnostics,
    );
  }

  const getDiagnostics = createDiagnosticsGetter([
    adjustedDiagnostics,
    adapterContext.diagnostics,
    input.extraDiagnostics ?? [],
  ]);
  return maybeChain(
    createResultFinalizer({
      finalize: input.createFinalize(adapters),
      getDiagnostics,
      trace: input.trace,
      diagnosticsMode: input.diagnosticsMode,
    }),
    executePipeline(input, adapters, adaptersWithContext),
  );
};
