import { describe, expect, it } from "bun:test";
import type { AdapterModel, AdapterRetriever } from "#adapters";
import { assertSyncOutcome, makeRuntime } from "./helpers";

describe("Workflow registry routing", () => {
  it("routes runs through builtin providers when no adapters are supplied", () => {
    let captured: unknown;
    const runtime = makeRuntime("agent", {
      includeDefaults: false,
      run: (options) => {
        captured = options;
        return { artifact: { ok: true } };
      },
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));
    expect(outcome.status).toBe("ok");
    const resolved = captured as { adapters?: { model?: AdapterModel } };
    expect(resolved.adapters?.model).toBeDefined();
  });

  it("prefers plugin-provided adapters over builtins", () => {
    let captured: unknown;
    const model: AdapterModel = {
      generate: () => ({ text: "custom" }),
    };
    const retriever: AdapterRetriever = {
      retrieve: () => ({ documents: [] }),
    };
    const runtime = makeRuntime("rag", {
      includeDefaults: false,
      plugins: [{ key: "custom.adapters", adapters: { model, retriever } }],
      run: (options) => {
        captured = options;
        return { artifact: { ok: true } };
      },
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));
    expect(outcome.status).toBe("ok");
    const resolved = captured as {
      adapters?: { model?: AdapterModel; retriever?: AdapterRetriever };
    };
    expect(resolved.adapters?.model).toBe(model);
    expect(resolved.adapters?.retriever).toBe(retriever);
  });

  it("re-resolves providers during resume using provider overrides", () => {
    let captured: unknown;
    const model: AdapterModel = {
      generate: () => ({ text: "override" }),
    };
    const runtime = makeRuntime("hitl-gate", {
      includeDefaults: false,
      plugins: [{ key: "override.adapters", adapters: { model } }],
      run: (options) => {
        captured = options;
        return { artifact: { ok: true } };
      },
    });

    if (!runtime.resume) {
      throw new Error("Expected resume to be available.");
    }

    const outcome = assertSyncOutcome(
      runtime.resume("token", undefined, {
        resume: {
          resolve: () => ({
            input: { token: "token" },
            providers: { model: "override.adapters:model" },
          }),
        },
      }),
    );

    expect(outcome.status).toBe("ok");
    const resolved = captured as { adapters?: { model?: AdapterModel } };
    expect(resolved.adapters?.model).toBe(model);
  });
});
