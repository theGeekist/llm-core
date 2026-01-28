import { describe, expect, it } from "bun:test";
import type { Runtime, WorkflowRuntime } from "../../src/workflow/types";
import { buildRuntimeDefaults, wrapRuntimeWithDefaults } from "../../src/recipes/runtime-defaults";
import type { RecipeDefaults } from "../../src/recipes/flow";

type DummyRuntime = WorkflowRuntime<unknown, Record<string, unknown>, unknown>;

const createRuntime = () => {
  const runtimes: Array<Runtime | undefined> = [];
  const runtime: DummyRuntime = {
    run: (_input: unknown, runtimeInput?: Runtime) => {
      runtimes.push(runtimeInput);
      return { status: "ok", artefact: {}, trace: [], diagnostics: [] };
    },
    resume: (_token: unknown, _resumeInput?: unknown, runtimeInput?: Runtime) => {
      runtimes.push(runtimeInput);
      return { status: "ok", artefact: {}, trace: [], diagnostics: [] };
    },
    capabilities: () => ({}),
    declaredCapabilities: () => ({}),
    adapters: () => ({}),
    declaredAdapters: () => ({}),
    explain: () => ({
      plugins: [],
      capabilities: {},
      declaredCapabilities: {},
      overrides: [],
      unused: [],
    }),
    contract: () => ({
      name: "agent",
      artefactKeys: [],
      outcomes: ["ok"],
      extensionPoints: [],
      minimumCapabilities: [],
    }),
  };
  return { runtime, runtimes };
};

describe("Recipe runtime defaults", () => {
  it("builds runtime defaults only when retry defaults exist", () => {
    const none = buildRuntimeDefaults({} satisfies RecipeDefaults);
    expect(none).toBeUndefined();

    const retryDefaults: RecipeDefaults = {
      retryDefaults: { model: { maxAttempts: 2, backoffMs: 10 } },
    };
    const result = buildRuntimeDefaults(retryDefaults);
    expect(result?.retryDefaults?.model?.maxAttempts).toBe(2);
  });

  it("merges retry defaults with runtime overrides", () => {
    const { runtime, runtimes } = createRuntime();
    const defaults: Runtime = {
      retryDefaults: { model: { maxAttempts: 2, backoffMs: 10 } },
    };
    const wrapped = wrapRuntimeWithDefaults(runtime, defaults);
    wrapped.run({ input: "x" }, { retryDefaults: { model: { maxAttempts: 3, backoffMs: 0 } } });

    const applied = runtimes[0];
    expect(applied?.retryDefaults?.model?.maxAttempts).toBe(3);
    expect(applied?.retryDefaults?.model?.backoffMs).toBe(0);
  });

  it("wraps resume with runtime defaults when available", () => {
    const { runtime, runtimes } = createRuntime();
    const defaults: Runtime = {
      retryDefaults: { embedder: { maxAttempts: 2, backoffMs: 5 } },
    };
    const wrapped = wrapRuntimeWithDefaults(runtime, defaults);
    wrapped.resume?.("token", undefined, {
      retryDefaults: { embedder: { maxAttempts: 4, backoffMs: 0 } },
    });

    const applied = runtimes[0];
    expect(applied?.retryDefaults?.embedder?.maxAttempts).toBe(4);
    expect(applied?.retryDefaults?.embedder?.backoffMs).toBe(0);
  });

  it("returns the original runtime when no defaults exist", () => {
    const { runtime } = createRuntime();
    const wrapped = wrapRuntimeWithDefaults(runtime, undefined);
    expect(wrapped).toBe(runtime);
  });
});
