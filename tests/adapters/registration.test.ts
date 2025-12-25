import { describe, expect, it } from "bun:test";
import { Adapter } from "#adapters";

describe("Adapter registration helpers", () => {
  const CUSTOM_PREFIX = "custom";

  it("builds a plugin with a single construct", () => {
    const plugin = Adapter.register(`${CUSTOM_PREFIX}.retriever`, "retriever", {
      retrieve: () => ({ documents: [] }),
    });
    expect(plugin.key).toBe(`${CUSTOM_PREFIX}.retriever`);
    expect(plugin.adapters.retriever).toBeDefined();
  });

  it("stores unknown constructs under constructs", () => {
    const plugin = Adapter.register(`${CUSTOM_PREFIX}.thing`, "mcp", { client: "ok" });
    expect(plugin.adapters.constructs).toEqual({ mcp: { client: "ok" } });
  });

  it("treats constructs as the full constructs map", () => {
    const plugin = Adapter.register(`${CUSTOM_PREFIX}.constructs`, "constructs", {
      mcp: { client: "ok" },
    });
    expect(plugin.adapters.constructs).toEqual({ mcp: { client: "ok" } });
  });

  it("wraps non-object constructs values for convenience", () => {
    const plugin = Adapter.register(`${CUSTOM_PREFIX}.value`, "constructs", "plain");
    expect(plugin.adapters.constructs).toEqual({ value: "plain" });
  });

  it("exposes value-first helpers", () => {
    const plugin = Adapter.model(`${CUSTOM_PREFIX}.model`, { generate: () => ({ text: "ok" }) });
    expect(plugin.adapters.model).toBeDefined();
  });

  it("supports media, tools, retriever, vector store, memory, cache, and trace helpers", () => {
    const image = Adapter.image(`${CUSTOM_PREFIX}.image`, {
      generate: () => ({ images: [] }),
    });
    const speech = Adapter.speech(`${CUSTOM_PREFIX}.speech`, {
      generate: () => ({ audio: { bytes: new Uint8Array() } }),
    });
    const transcription = Adapter.transcription(`${CUSTOM_PREFIX}.transcription`, {
      generate: () => ({ text: "" }),
    });
    const tools = Adapter.tools(`${CUSTOM_PREFIX}.tools`, [{ name: "tool" }]);
    const retriever = Adapter.retriever(`${CUSTOM_PREFIX}.retriever`, {
      retrieve: () => ({ documents: [] }),
    });
    const vectorStore = Adapter.vectorStore(`${CUSTOM_PREFIX}.vectorStore`, {
      upsert: () => ({ ids: [] }),
      delete: () => undefined,
    });
    const memory = Adapter.memory(`${CUSTOM_PREFIX}.memory`, {
      append: () => undefined,
    });
    const cache = Adapter.cache(`${CUSTOM_PREFIX}.cache`, {
      get: () => undefined,
      set: () => undefined,
      delete: () => undefined,
    });
    const trace = Adapter.trace(`${CUSTOM_PREFIX}.trace`, { emit: () => undefined });

    expect(image.adapters.image).toBeDefined();
    expect(speech.adapters.speech).toBeDefined();
    expect(transcription.adapters.transcription).toBeDefined();
    expect(tools.adapters.tools).toBeDefined();
    expect(retriever.adapters.retriever).toBeDefined();
    expect(vectorStore.adapters.vectorStore).toBeDefined();
    expect(memory.adapters.memory).toBeDefined();
    expect(cache.adapters.cache).toBeDefined();
    expect(trace.adapters.trace).toBeDefined();
  });

  it("passes through plugin options", () => {
    const plugin = Adapter.plugin(
      `${CUSTOM_PREFIX}.plugin`,
      { tools: [{ name: "tool" }] },
      { mode: "override", overrideKey: "override.key" },
    );

    expect(plugin.mode).toBe("override");
    expect(plugin.overrideKey).toBe("override.key");
  });
});
