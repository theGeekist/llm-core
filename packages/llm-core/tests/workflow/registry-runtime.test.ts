import { describe, expect, it } from "bun:test";
import type { Model, Retriever } from "#adapters";
import { assertSyncOutcome, makeRuntime } from "./helpers";

describe("Workflow registry routing", () => {
  it("routes runs through builtin providers when no adapters are supplied", () => {
    let captured: unknown;
    const runtime = makeRuntime("agent", {
      includeDefaults: false,
      run: (options) => {
        captured = options;
        return { artefact: { ok: true } };
      },
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));
    expect(outcome.status).toBe("ok");
    const resolved = captured as { adapters?: { model?: Model } };
    expect(resolved.adapters?.model).toBeDefined();
  });

  it("prefers plugin-provided adapters over builtins", () => {
    let captured: unknown;
    const modelMeta = { source: "plugin-model" };
    const model: Model = {
      generate: () => ({ text: "custom" }),
      metadata: modelMeta,
    };
    const marker = { id: "plugin-doc", text: "plugin" };
    const retrieverMeta = { source: "plugin-retriever" };
    const retriever: Retriever = {
      retrieve: () => ({ documents: [marker] }),
      metadata: retrieverMeta,
    };
    const runtime = makeRuntime("rag", {
      includeDefaults: false,
      plugins: [{ key: "custom.adapters", adapters: { model, retriever } }],
      run: (options) => {
        captured = options;
        return { artefact: { ok: true } };
      },
    });

    const outcome = assertSyncOutcome(runtime.run({ input: "hello" }));
    expect(outcome.status).toBe("ok");
    const resolved = captured as {
      adapters?: { model?: Model; retriever?: Retriever };
    };
    expect(resolved.adapters?.model?.metadata).toBe(modelMeta);
    const retrieved = resolved.adapters?.retriever?.retrieve({ query: "q" });
    expect(retrieved && typeof retrieved === "object").toBe(true);
    expect(resolved.adapters?.retriever?.metadata).toBe(retrieverMeta);
    const result = retrieved as { documents?: unknown[] };
    expect(result.documents?.[0]).toBe(marker);
  });
});
