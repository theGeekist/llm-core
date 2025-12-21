import { describe, expect, it } from "bun:test";
import { Workflow } from "#workflow";
import { createRuntime } from "#workflow/runtime";
import { getRecipe } from "#workflow/recipe-registry";
import type { Outcome, Plugin, RecipeName } from "#workflow/types";
import { getEffectivePlugins } from "../../src/workflow/plugins/effective";

describe("Workflow builder/runtime", () => {
  const KEY_MODEL_OPENAI = "model.openai";
  const KEY_RETRIEVER_VECTOR = "retriever.vector";
  const KEY_RETRIEVER_RERANK = "retriever.rerank";
  const KEY_REQUIRES_RETRIEVER = "plugin.requires.retriever";
  const VALUE_OVERRIDE_ONLY = "override-only";
  const ERROR_MISSING_CONTRACT = "Missing recipe contract.";
  const TOKEN_NEEDS_HUMAN = "token-1";
  const withFactory =
    <T>(factory: () => T) =>
    (_contract: unknown, _plugins: unknown[]) => {
      void _contract;
      void _plugins;
      return factory();
    };
  const isPromiseLike = (value: unknown): value is Promise<unknown> =>
    !!value && typeof (value as Promise<unknown>).then === "function";
  const assertSyncOutcome = (value: Outcome | Promise<Outcome>) => {
    if (isPromiseLike(value)) {
      throw new Error("Expected a synchronous Outcome, got a Promise.");
    }
    return value;
  };
  const diagnosticMessages = (diagnostics: unknown[]) =>
    diagnostics
      .map((diagnostic) => {
        if (typeof diagnostic === "string") {
          return diagnostic;
        }
        const entry = diagnostic as { message?: string };
        return entry.message;
      })
      .filter((message): message is string => !!message);
  const getContract = (name: RecipeName) => {
    const contract = getRecipe(name);
    if (!contract) {
      throw new Error(ERROR_MISSING_CONTRACT);
    }
    return contract;
  };
  const makeRuntime = (
    name: RecipeName,
    options?: {
      plugins?: Plugin[];
      run?: (options: TestRunOptions) => unknown;
    }
  ) => {
    const contract = getContract(name);
    const run = options?.run;
    const pipelineFactory = run
      ? withFactory(
          () =>
            ({
              run: (runOptions: TestRunOptions) => run(runOptions),
              extensions: { use: () => undefined },
            }) as never
        )
      : undefined;
    return createRuntime({
      contract,
      plugins: options?.plugins ?? [],
      pipelineFactory,
    });
  };
  const makeWorkflow = (name: RecipeName, plugins: Plugin[] = []) => {
    let builder = Workflow.recipe(name);
    for (const plugin of plugins) {
      builder = builder.use(plugin);
    }
    return builder.build();
  };
  type TestRunOptions = {
    input: unknown;
    runtime?: unknown;
    reporter?: unknown;
  };

  it("builds a runtime from a known recipe", async () => {
    const runtime = makeWorkflow("agent");
    const outcome = await runtime.run({ input: "hello" });

    expect(outcome.status).toBe("ok");
    expect(outcome.trace).toBeArray();
    expect(outcome.diagnostics).toBeArray();
    expect(runtime.contract().name).toBe("agent");
  });

  it("collects plugin keys for explain()", () => {
    const runtime = makeWorkflow("rag", [
      { key: KEY_MODEL_OPENAI, capabilities: { model: { name: "openai" } } },
      { key: KEY_RETRIEVER_VECTOR, capabilities: { retriever: { type: "vector" } } },
    ]);

    const explain = runtime.explain();
    expect(explain.plugins).toEqual([KEY_MODEL_OPENAI, KEY_RETRIEVER_VECTOR]);
    expect(explain.capabilities).toEqual({
      model: { name: "openai" },
      retriever: { type: "vector" },
    });
    expect(explain.declaredCapabilities).toEqual({
      model: { name: "openai" },
      retriever: { type: "vector" },
    });
  });

  it("throws for unknown recipes", () => {
    expect(() => Workflow.recipe("unknown" as never)).toThrow("Unknown recipe");
  });

  it("supports sync workflows without requiring await", () => {
    const runtime = makeWorkflow("agent");
    const outcome = runtime.run({ input: "sync-call" });

    const syncOutcome = assertSyncOutcome(outcome);
    expect(syncOutcome.status).toBe("ok");
  });

  it("maps pipeline errors to error outcomes", async () => {
    const runtime = makeRuntime("agent", {
      run: () => {
        throw new Error("boom");
      },
    });

    const outcome = await runtime.run({ input: "fail" });
    expect(outcome.status).toBe("error");
  });

  it("handles sync pipeline success paths with artifacts", () => {
    const runtime = makeRuntime("rag", {
      run: () => ({
        artifact: { answer: "sync-ok" },
        diagnostics: ["sync-warn"],
      }),
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "sync-artifact" }));
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(outcome.artefact).toEqual({ answer: "sync-ok" });
    expect(diagnosticMessages(outcome.diagnostics)).toEqual(["sync-warn"]);
  });

  it("handles async pipeline success paths", async () => {
    const runtime = makeRuntime("rag", {
      run: () =>
        Promise.resolve({
          artifact: { answer: "ok" },
          diagnostics: ["warn"],
        }),
    });

    const outcome = await runtime.run({ input: "async" });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(outcome.artefact).toEqual({ answer: "ok" });
    expect(diagnosticMessages(outcome.diagnostics)).toEqual(["warn"]);
  });

  it("maps async pipeline failures to error outcomes", async () => {
    const runtime = makeRuntime("rag", {
      run: () => Promise.reject(new Error("async boom")),
    });

    const outcome = await runtime.run({ input: "async-fail" });
    expect(outcome.status).toBe("error");
  });

  it("maps needsHuman outcomes with partial artefacts", async () => {
    const runtime = makeRuntime("hitl-gate", {
      run: () =>
        Promise.resolve({
          needsHuman: true,
          token: TOKEN_NEEDS_HUMAN,
          artifact: { partial: true },
        }),
    });

    const outcome = await runtime.run({ input: "gate" });
    expect(outcome.status).toBe("needsHuman");
    if (outcome.status !== "needsHuman") {
      throw new Error("Expected needsHuman outcome.");
    }
    expect(outcome.token).toBe(TOKEN_NEEDS_HUMAN);
    expect(outcome.artefact).toEqual({ partial: true });
  });

  it("keeps explain() snapshot deterministic after build", () => {
    let builder = Workflow.recipe("rag");
    builder = builder.use({ key: KEY_MODEL_OPENAI });
    const runtime = builder.build();

    builder.use({ key: KEY_RETRIEVER_VECTOR });

    expect(runtime.explain().plugins).toEqual([KEY_MODEL_OPENAI]);
  });

  it("derives capabilities from plugins", () => {
    const runtime = makeWorkflow("agent", [
      { key: KEY_MODEL_OPENAI, capabilities: { model: { name: "openai" } } },
      { key: "tools.web", capabilities: { tools: ["web.search"] } },
    ]);

    expect(runtime.capabilities()).toEqual({
      model: { name: "openai" },
      tools: ["web.search"],
    });
  });

  it("reports missing requirements in explain()", () => {
    const runtime = makeWorkflow("rag", [{ key: KEY_RETRIEVER_RERANK, requires: ["retriever"] }]);

    expect(runtime.explain().missingRequirements ?? []).toEqual([
      `${KEY_RETRIEVER_RERANK} (requires retriever)`,
    ]);
  });

  it("evaluates missing requirements against resolved capabilities", () => {
    const runtime = makeWorkflow("rag", [
      {
        key: "retriever.primary",
        capabilities: { retriever: { type: "vector" } },
      },
      {
        key: "retriever.override",
        mode: "override",
        overrideKey: "retriever.primary",
        capabilities: { model: { name: VALUE_OVERRIDE_ONLY } },
      },
      {
        key: KEY_REQUIRES_RETRIEVER,
        requires: ["retriever"],
      },
    ]);

    const explain = runtime.explain();
    expect(explain.capabilities).toEqual({ model: { name: VALUE_OVERRIDE_ONLY } });
    expect(explain.declaredCapabilities).toEqual({
      retriever: { type: "vector" },
      model: { name: VALUE_OVERRIDE_ONLY },
    });
    expect(explain.missingRequirements ?? []).toEqual([
      `${KEY_REQUIRES_RETRIEVER} (requires retriever)`,
    ]);
  });

  it("reports override and duplicate plugins in explain()", () => {
    const runtime = makeWorkflow("agent", [
      { key: KEY_MODEL_OPENAI },
      { key: "model.openai.override", mode: "override", overrideKey: KEY_MODEL_OPENAI },
      { key: KEY_MODEL_OPENAI },
    ]);

    const explain = runtime.explain();
    expect(explain.overrides).toEqual([`model.openai.override overrides ${KEY_MODEL_OPENAI}`]);
    expect(explain.unused).toEqual([`${KEY_MODEL_OPENAI} (duplicate key)`]);
  });

  it("emits diagnostics when plugin lifecycles are not scheduled", async () => {
    const runtime = makeRuntime("rag", {
      plugins: [
        {
          key: "plugin.missing.lifecycle",
          lifecycle: "notScheduled",
          hook: () => undefined,
        },
      ],
      run: () =>
        Promise.resolve({
          artifact: { answer: "ok" },
        }),
    });

    const outcome = await runtime.run({ input: "diag" });
    expect(diagnosticMessages(outcome.diagnostics)).toEqual([
      'Plugin "plugin.missing.lifecycle" extension skipped (lifecycle "notScheduled" not scheduled).',
    ]);
  });

  it("passes runtime reporter into pipeline run options", () => {
    const reporter = {
      warn: () => undefined,
    };
    const runtime = makeRuntime("agent", {
      run: (options) => {
        expect(options.reporter).toBe(reporter);
        return { artifact: { ok: true } };
      },
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "reporter" }, { reporter }));
    expect(outcome.status).toBe("ok");
  });

  it("reports lifecycle diagnostics for register plugins", async () => {
    const runtime = makeRuntime("rag", {
      plugins: [
        {
          key: "plugin.register.lifecycle",
          lifecycle: "notScheduled",
          register: () => ({ lifecycle: "notScheduled", hook: () => undefined }),
        },
      ],
      run: () =>
        Promise.resolve({
          artifact: { answer: "ok" },
        }),
    });

    const outcome = await runtime.run({ input: "diag-register" });
    expect(diagnosticMessages(outcome.diagnostics)).toEqual([
      'Plugin "plugin.register.lifecycle" extension skipped (lifecycle "notScheduled" not scheduled).',
    ]);
  });

  it("escalates error diagnostics in strict mode", async () => {
    const runtime = makeRuntime("rag", {
      plugins: [{ key: KEY_RETRIEVER_RERANK, requires: ["retriever"] }],
      run: () => Promise.resolve({ artifact: { answer: "ok" } }),
    });

    const outcome = await runtime.run(
      { input: "strict" },
      { diagnostics: "strict" }
    );
    expect(outcome.status).toBe("error");
    expect(diagnosticMessages(outcome.diagnostics)).toEqual([
      `${KEY_RETRIEVER_RERANK} (requires retriever)`,
    ]);
  });

  it("exposes resume only for recipes that support needsHuman", () => {
    const resumable = makeWorkflow("hitl-gate");
    const nonResumable = makeWorkflow("rag");

    expect(resumable.resume).toBeFunction();
    expect(nonResumable.resume).toBeUndefined();
  });

  it("keeps only effective plugins after overrides", () => {
    const effective = getEffectivePlugins([
      { key: "alpha", helperKinds: ["one"] },
      { key: "alpha.override", mode: "override", overrideKey: "alpha", helperKinds: ["two"] },
      { key: "alpha", helperKinds: ["three"] },
    ]);

    expect(effective.map((plugin) => plugin.key)).toEqual(["alpha.override"]);
    expect(effective[0]?.helperKinds).toEqual(["two"]);
  });

  it("ignores overridden plugins when registering extensions", async () => {
    const calls: string[] = [];
    const contract = getContract("rag");
    const runtime = createRuntime({
      contract,
      plugins: [
        {
          key: "ext.base",
          register: () => {
            calls.push("base");
            return undefined;
          },
        },
        {
          key: "ext.override",
          mode: "override",
          overrideKey: "ext.base",
          register: () => {
            calls.push("override");
            return undefined;
          },
        },
      ],
      pipelineFactory: withFactory(
        () =>
          ({
            run: () => ({ artifact: { ok: true } }),
            extensions: {
              use: (extension: { register?: () => unknown }) => {
                extension.register?.();
              },
            },
          }) as never
      ),
    });

    const outcome = await runtime.run({ input: "extensions" });
    expect(outcome.status).toBe("ok");
    expect(calls).toEqual(["override"]);
  });

  it("ignores overridden requires in strict mode", async () => {
    const runtime = makeRuntime("rag", {
      plugins: [
        { key: "requires.base", requires: ["retriever"] },
        {
          key: "requires.override",
          mode: "override",
          overrideKey: "requires.base",
          capabilities: { model: { name: "override" } },
        },
      ],
      run: () => Promise.resolve({ artifact: { answer: "ok" } }),
    });

    const outcome = await runtime.run({ input: "strict" }, { diagnostics: "strict" });
    expect(outcome.status).toBe("ok");
  });
});
