import { describe, expect, it } from "bun:test";
import { Recipe } from "../../src/recipes/flow";
import { defineSinglePackRecipe } from "../../src/recipes/handle";
import { wrapRuntime } from "../../src/workflow/runtime-wrapper";
import type {
  ArtefactOf,
  RecipeName,
  ResumeInputOf,
  RunInputOf,
  Runtime,
  WorkflowRuntime,
} from "../../src/workflow/types";
import { getRecipe } from "../../src/workflow/recipe-registry";

type AgentRuntime = WorkflowRuntime<
  RunInputOf<"agent">,
  ArtefactOf<"agent">,
  ResumeInputOf<"agent">
>;

const requireContract = (name: RecipeName) => {
  const contract = getRecipe(name);
  if (!contract) {
    throw new Error(`Expected ${name} recipe contract.`);
  }
  return contract;
};

const createRuntime = (withResume: boolean): AgentRuntime => {
  const outcome = {
    status: "ok" as const,
    artefact: {},
    trace: [],
    diagnostics: [],
  };
  return {
    run: () => outcome,
    resume: withResume ? () => outcome : undefined,
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
    contract: () => requireContract("agent"),
  };
};

const defineTestSteps: Parameters<typeof Recipe.pack>[1] = ({ step }) => ({
  run: step("run", () => null),
});

describe("Recipe simplification equivalence", () => {
  it("reuses the singleton pack and creates configured packs on demand", () => {
    let packCreations = 0;
    const createPack = (config?: { name: string }) => {
      packCreations += 1;
      return Recipe.pack(config?.name ?? "default", defineTestSteps);
    };
    const definition = defineSinglePackRecipe("agent", createPack);

    expect(packCreations).toBe(1);
    expect(definition.pack.name).toBe("default");
    expect(definition.createRecipe().explain().steps[0]?.id).toBe("default.run");
    expect(definition.createRecipe().explain().steps[0]?.id).toBe("default.run");
    expect(packCreations).toBe(1);

    expect(definition.createRecipe({ name: "configured" }).explain().steps[0]?.id).toBe(
      "configured.run",
    );
    expect(packCreations).toBe(2);
  });

  it("decorates run and resume without making synchronous results asynchronous", () => {
    const runtime = createRuntime(true);
    const seenRuntime: Array<Runtime | undefined> = [];
    const wrapped = wrapRuntime<"agent">(runtime, {
      run: (next, input, runtimeInput) => {
        seenRuntime.push(runtimeInput);
        return next(input, runtimeInput);
      },
      resume: (next, ...args) => {
        seenRuntime.push(args[2]);
        return next(...args);
      },
    });
    const runtimeInput: Runtime = { diagnostics: "strict" };

    const runResult = wrapped.run({ input: "run" }, runtimeInput);
    const resumeResult = wrapped.resume?.("token", undefined, runtimeInput);

    expect(runResult).not.toBeInstanceOf(Promise);
    expect(resumeResult).not.toBeInstanceOf(Promise);
    expect(seenRuntime).toEqual([runtimeInput, runtimeInput]);
  });

  it("does not add resume to runtimes that cannot resume", () => {
    const runtime = createRuntime(false);
    const wrapped = wrapRuntime<"agent">(runtime, {
      run: (next, ...args) => next(...args),
      resume: (next, ...args) => next(...args),
    });

    expect(wrapped.resume).toBeUndefined();
  });

  it("preserves method receivers while decorating runtime calls", () => {
    const base = createRuntime(true);
    const outcome = base.run({ input: "expected" });
    let runReceiver = false;
    let resumeReceiver = false;
    const runtime: AgentRuntime = {
      ...base,
      run: function run() {
        runReceiver = this === runtime;
        return outcome;
      },
      resume: function resume() {
        resumeReceiver = this === runtime;
        return outcome;
      },
    };
    const wrapped = wrapRuntime<"agent">(runtime, {
      run: (next, ...args) => next(...args),
      resume: (next, ...args) => next(...args),
    });

    wrapped.run({ input: "run" });
    wrapped.resume?.("token");

    expect(runReceiver).toBe(true);
    expect(resumeReceiver).toBe(true);
  });
});
