import { describe, expect, it } from "bun:test";
import {
  applyDiagnosticsMode,
  createPipelineDiagnostic,
  createRequirementDiagnostic,
  normalizeDiagnostics,
} from "../../src/workflow/diagnostics";
import { createRuntime } from "#workflow/runtime";
import { getRecipe, registerRecipe } from "#workflow/recipe-registry";
import { diagnosticMessages, makeRuntime } from "./helpers";

describe("Workflow diagnostics", () => {
  const KEY_RETRIEVER_RERANK = "retriever.rerank";

  it("normalizes pipeline diagnostics", () => {
    const diagnostics = [createRequirementDiagnostic("Missing tools")];
    const pipelineDiagnostics = [
      "pipeline warning",
      { type: "missing-dependency", message: "Missing dependency" },
      { type: "unused-helper", message: "Unused helper" },
    ];

    const normalized = normalizeDiagnostics(diagnostics, pipelineDiagnostics);
    expect(normalized).toHaveLength(4);
    expect(normalized[1]?.kind).toBe("pipeline");
    expect(normalized[2]?.level).toBe("error");
    expect(normalized[3]?.level).toBe("warn");
  });

  it("promotes requirement diagnostics in strict mode", () => {
    const diagnostics = [createRequirementDiagnostic("Missing tools")];
    const promoted = applyDiagnosticsMode(diagnostics, "strict");

    expect(promoted[0]?.level).toBe("error");
  });

  it("wraps pipeline diagnostics with fallback messages", () => {
    const entry = createPipelineDiagnostic({ type: "conflict" });
    expect(entry.level).toBe("error");
    expect(entry.message).toBe("Pipeline diagnostic reported.");
  });

  it("warns when the default lifecycle is not scheduled", async () => {
    const original = getRecipe("rag");
    registerRecipe({
      ...original,
      extensionPoints: ["beforeRetrieve"],
    });
    try {
      const runtime = makeRuntime("rag", {
        plugins: [{ key: "plugin.default.lifecycle", hook: () => undefined }],
        run: () => Promise.resolve({ artifact: { answer: "ok" } }),
      });

      const outcome = await runtime.run({ input: "diag-default" });
      expect(diagnosticMessages(outcome.diagnostics)).toEqual([
        'Plugin "plugin.default.lifecycle" extension skipped (default lifecycle "init" not scheduled).',
      ]);
    } finally {
      registerRecipe(original);
    }
  });

  it("warns when pipeline extensions are unavailable", async () => {
    const contract = getRecipe("rag");
    const runtime = createRuntime({
      contract,
      plugins: [{ key: "plugin.no.extensions", hook: () => undefined }],
      pipelineFactory: () =>
        ({
          run: () => ({ artifact: { ok: true } }),
        }) as never,
    });

    const outcome = await runtime.run({ input: "no-extensions" });
    expect(diagnosticMessages(outcome.diagnostics)).toContain(
      "Pipeline extensions unavailable; plugin extensions skipped.",
    );
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
      plugins: [{ key: KEY_RETRIEVER_RERANK, requires: ["tools"] }],
      run: () => Promise.resolve({ artifact: { answer: "ok" } }),
    });

    const outcome = await runtime.run({ input: "strict" }, { diagnostics: "strict" });
    expect(outcome.status).toBe("error");
    expect(diagnosticMessages(outcome.diagnostics)).toEqual([
      `${KEY_RETRIEVER_RERANK} (requires tools)`,
    ]);
  });

  it("warns for missing recipe minimum capabilities in default mode", async () => {
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      run: () => Promise.resolve({ artifact: { answer: "ok" } }),
    });

    const outcome = await runtime.run({ input: "defaults" });
    expect(outcome.status).toBe("ok");
    expect(diagnosticMessages(outcome.diagnostics)).toContain(
      'Recipe "hitl-gate" requires capability "evaluator".',
    );
    expect(diagnosticMessages(outcome.diagnostics)).toContain(
      'Recipe "hitl-gate" requires capability "hitl".',
    );
  });

  it("fails strict mode when recipe minimum capabilities are missing", async () => {
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      run: () => Promise.resolve({ artifact: { answer: "ok" } }),
    });

    const outcome = await runtime.run({ input: "strict" }, { diagnostics: "strict" });
    expect(outcome.status).toBe("error");
    expect(diagnosticMessages(outcome.diagnostics)).toContain(
      'Recipe "hitl-gate" requires capability "evaluator".',
    );
    expect(diagnosticMessages(outcome.diagnostics)).toContain(
      'Recipe "hitl-gate" requires capability "hitl".',
    );
  });

  it("treats empty capability arrays as missing for minimum requirements", async () => {
    const runtime = makeRuntime("agent", {
      includeDefaults: false,
      plugins: [
        { key: "model.only", capabilities: { model: { name: "ok" } } },
        { key: "tools.empty", capabilities: { tools: [] } },
      ],
      run: () => Promise.resolve({ artifact: { answer: "ok" } }),
    });

    const outcome = await runtime.run({ input: "defaults" });
    expect(outcome.status).toBe("ok");
    expect(diagnosticMessages(outcome.diagnostics)).toContain(
      'Recipe "agent" requires capability "tools".',
    );
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
