import { describe, expect, it } from "bun:test";
import { makeWorkflow, resolveMaybe } from "./helpers";

describe("Workflow explain()", () => {
  const KEY_MODEL_OPENAI = "model.openai";
  const KEY_RETRIEVER_VECTOR = "retriever.vector";
  const KEY_RETRIEVER_RERANK = "retriever.rerank";
  const KEY_REQUIRES_RETRIEVER = "plugin.requires.retriever";
  const VALUE_OVERRIDE_ONLY = "override-only";
  const MODEL_OPENAI_NAME = "openai";
  const RETRIEVER_VECTOR_TYPE = "vector";
  const TOOLS_WEB_SEARCH = "web.search";

  it("collects plugin keys for explain()", () => {
    const runtime = makeWorkflow(
      "rag",
      [
        { key: KEY_MODEL_OPENAI, capabilities: { model: { name: MODEL_OPENAI_NAME } } },
        { key: KEY_RETRIEVER_VECTOR, capabilities: { retriever: { type: RETRIEVER_VECTOR_TYPE } } },
      ],
      { includeDefaults: false },
    );

    const explain = runtime.explain();
    expect(explain.plugins).toEqual([KEY_MODEL_OPENAI, KEY_RETRIEVER_VECTOR]);
    expect(explain.capabilities).toEqual({
      model: { name: MODEL_OPENAI_NAME },
      retriever: { type: RETRIEVER_VECTOR_TYPE },
    });
    expect(explain.declaredCapabilities).toEqual({
      model: { name: MODEL_OPENAI_NAME },
      retriever: { type: RETRIEVER_VECTOR_TYPE },
    });
  });

  it("derives capabilities from plugins", async () => {
    const runtime = makeWorkflow(
      "agent",
      [
        { key: KEY_MODEL_OPENAI, capabilities: { model: { name: MODEL_OPENAI_NAME } } },
        { key: "tools.web", capabilities: { tools: [TOOLS_WEB_SEARCH] } },
      ],
      { includeDefaults: false },
    );

    expect(runtime.declaredCapabilities()).toEqual({
      model: { name: MODEL_OPENAI_NAME },
      tools: [TOOLS_WEB_SEARCH],
    });
    const resolved = await resolveMaybe(runtime.capabilities());
    expect(resolved).toMatchObject({
      model: { name: MODEL_OPENAI_NAME },
      tools: [TOOLS_WEB_SEARCH],
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
          capabilities: { retriever: { type: RETRIEVER_VECTOR_TYPE } },
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
      retriever: { type: RETRIEVER_VECTOR_TYPE },
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
