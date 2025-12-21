import { describe, expect, it } from "bun:test";
import { makeWorkflow } from "./helpers";

describe("Workflow explain()", () => {
  const KEY_MODEL_OPENAI = "model.openai";
  const KEY_RETRIEVER_VECTOR = "retriever.vector";
  const KEY_RETRIEVER_RERANK = "retriever.rerank";
  const KEY_REQUIRES_RETRIEVER = "plugin.requires.retriever";
  const VALUE_OVERRIDE_ONLY = "override-only";

  it("collects plugin keys for explain()", () => {
    const runtime = makeWorkflow(
      "rag",
      [
        { key: KEY_MODEL_OPENAI, capabilities: { model: { name: "openai" } } },
        { key: KEY_RETRIEVER_VECTOR, capabilities: { retriever: { type: "vector" } } },
      ],
      { includeDefaults: false },
    );

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

  it("derives capabilities from plugins", () => {
    const runtime = makeWorkflow(
      "agent",
      [
        { key: KEY_MODEL_OPENAI, capabilities: { model: { name: "openai" } } },
        { key: "tools.web", capabilities: { tools: ["web.search"] } },
      ],
      { includeDefaults: false },
    );

    expect(runtime.capabilities()).toEqual({
      model: { name: "openai" },
      tools: ["web.search"],
    });
  });

  it("reports missing requirements in explain()", () => {
    const runtime = makeWorkflow("rag", [{ key: KEY_RETRIEVER_RERANK, requires: ["retriever"] }], {
      includeDefaults: false,
    });

    expect(runtime.explain().missingRequirements ?? []).toEqual([
      `${KEY_RETRIEVER_RERANK} (requires retriever)`,
    ]);
  });

  it("evaluates missing requirements against resolved capabilities", () => {
    const runtime = makeWorkflow(
      "rag",
      [
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
      ],
      { includeDefaults: false },
    );

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
    const runtime = makeWorkflow(
      "agent",
      [
        { key: KEY_MODEL_OPENAI },
        { key: "model.openai.override", mode: "override", overrideKey: KEY_MODEL_OPENAI },
        { key: KEY_MODEL_OPENAI },
      ],
      { includeDefaults: false },
    );

    const explain = runtime.explain();
    expect(explain.overrides).toEqual([`model.openai.override overrides ${KEY_MODEL_OPENAI}`]);
    expect(explain.unused).toEqual([`${KEY_MODEL_OPENAI} (duplicate key)`]);
  });
});
