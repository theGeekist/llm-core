import { describe, expect, it } from "bun:test";
import type { AdapterBundle } from "#adapters";
import { executePipelineResolution } from "../../src/workflow/runtime/pipeline-runner";

type KernelResult = {
  error?: unknown;
  diagnostics?: unknown[];
  result?: unknown;
  finalized?: boolean;
};

describe("Workflow pipeline execution kernel", () => {
  it("preserves synchronous pipeline and finalizer behavior", () => {
    const adapters: AdapterBundle = { constructs: {} };
    const result = executePipelineResolution<KernelResult>({
      deps: {
        pipeline: { run: () => "value" },
        readContractDiagnostics: () => [],
        buildDiagnostics: [],
        strictErrorMessage: "strict",
        toErrorOutcome: (error) => ({ error }),
      },
      resolution: { adapters, diagnostics: [], constructs: {} },
      selectAdapters: (resolution) => resolution.adapters,
      input: "input",
      trace: [],
      diagnosticsMode: "default",
      createFinalize: () => (input) => ({
        result: input.result,
        diagnostics: input.getDiagnostics(),
      }),
    });

    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual({ result: "value", diagnostics: [] });
  });

  it("applies strict diagnostics before running the pipeline", () => {
    let ran = false;
    const adapters: AdapterBundle = { constructs: {} };
    const result = executePipelineResolution<KernelResult>({
      deps: {
        pipeline: {
          run: () => {
            ran = true;
            return "value";
          },
        },
        readContractDiagnostics: () => [
          { level: "warn", kind: "contract", message: "contract warning" },
        ],
        buildDiagnostics: [{ level: "warn", kind: "workflow", message: "build warning" }],
        strictErrorMessage: "strict",
        toErrorOutcome: (error, _trace, diagnostics) => ({ error, diagnostics }),
      },
      resolution: { adapters, diagnostics: [], constructs: {} },
      selectAdapters: (resolution) => resolution.adapters,
      input: "input",
      trace: [],
      diagnosticsMode: "strict",
      strictDiagnostics: [{ level: "warn", kind: "resume", message: "resume warning" }],
      createFinalize: () => () => ({ finalized: true }),
    });

    expect(ran).toBe(false);
    expect(result).toMatchObject({
      error: new Error("strict"),
      diagnostics: [
        { message: "build warning" },
        { message: "resume warning" },
        { level: "error", message: "contract warning" },
      ],
    });
  });
});
