import { describe, expect, it } from "bun:test";
import { Adapter } from "#adapters";

describe("Adapter registration helpers", () => {
  const CUSTOM_PREFIX = "custom";

  it("builds a plugin with a single construct", () => {
    const plugin = Adapter.retriever({
      key: `${CUSTOM_PREFIX}.retriever`,
      value: { retrieve: () => ({ documents: [] }) },
    });
    expect(plugin.key).toBe(`${CUSTOM_PREFIX}.retriever`);
    expect(plugin.adapters.retriever).toBeDefined();
  });

  it("stores unknown constructs under constructs", () => {
    const plugin = Adapter.plugin({
      key: `${CUSTOM_PREFIX}.thing`,
      adapters: { constructs: { mcp: { client: "ok" } } },
    });
    expect(plugin.adapters.constructs).toEqual({ mcp: { client: "ok" } });
  });

  it("treats constructs as the full constructs map", () => {
    const plugin = Adapter.plugin({
      key: `${CUSTOM_PREFIX}.constructs`,
      adapters: { constructs: { mcp: { client: "ok" } } },
    });
    expect(plugin.adapters.constructs).toEqual({ mcp: { client: "ok" } });
  });

  it("accepts explicit construct values", () => {
    const plugin = Adapter.plugin({
      key: `${CUSTOM_PREFIX}.value`,
      adapters: { constructs: { value: "plain" } },
    });
    expect(plugin.adapters.constructs).toEqual({ value: "plain" });
  });

  it("exposes named registration helpers", () => {
    const plugin = Adapter.model({
      key: `${CUSTOM_PREFIX}.model`,
      value: { generate: () => ({ text: "ok" }) },
    });
    expect(plugin.adapters.model).toBeDefined();
  });

  it("supports media, tools, retriever, vector store, memory, cache, trace, indexing, and orchestration helpers", () => {
    const image = Adapter.image({
      key: `${CUSTOM_PREFIX}.image`,
      value: { generate: () => ({ images: [] }) },
    });
    const speech = Adapter.speech({
      key: `${CUSTOM_PREFIX}.speech`,
      value: { generate: () => ({ audio: { bytes: new Uint8Array() } }) },
    });
    const transcription = Adapter.transcription({
      key: `${CUSTOM_PREFIX}.transcription`,
      value: { generate: () => ({ text: "" }) },
    });
    const tools = Adapter.tools({ key: `${CUSTOM_PREFIX}.tools`, value: [{ name: "tool" }] });
    const retriever = Adapter.retriever({
      key: `${CUSTOM_PREFIX}.retriever`,
      value: { retrieve: () => ({ documents: [] }) },
    });
    const vectorStore = Adapter.vectorStore({
      key: `${CUSTOM_PREFIX}.vectorStore`,
      value: { upsert: () => ({ ids: [] }), delete: () => null },
    });
    const memory = Adapter.memory({
      key: `${CUSTOM_PREFIX}.memory`,
      value: { append: () => null },
    });
    const cache = Adapter.cache({
      key: `${CUSTOM_PREFIX}.cache`,
      value: { get: () => null, set: () => null, delete: () => null },
    });
    const eventStream = Adapter.eventStream({
      key: `${CUSTOM_PREFIX}.eventStream`,
      value: { emit: () => null },
    });
    const interrupt = Adapter.interrupt({
      key: `${CUSTOM_PREFIX}.interrupt`,
      value: { mode: "continue" },
    });
    const trace = Adapter.trace({
      key: `${CUSTOM_PREFIX}.trace`,
      value: { emit: () => null },
    });
    const indexing = Adapter.indexing({
      key: `${CUSTOM_PREFIX}.indexing`,
      value: { index: () => ({ added: 0, deleted: 0, updated: 0, skipped: 0 }) },
    });
    const queryEngine = Adapter.queryEngine({
      key: `${CUSTOM_PREFIX}.queryEngine`,
      value: { query: () => ({ text: "" }) },
    });
    const responseSynthesizer = Adapter.responseSynthesizer({
      key: `${CUSTOM_PREFIX}.responseSynthesizer`,
      value: { synthesize: () => ({ text: "" }) },
    });

    expect(image.adapters.image).toBeDefined();
    expect(speech.adapters.speech).toBeDefined();
    expect(transcription.adapters.transcription).toBeDefined();
    expect(tools.adapters.tools).toBeDefined();
    expect(retriever.adapters.retriever).toBeDefined();
    expect(vectorStore.adapters.vectorStore).toBeDefined();
    expect(memory.adapters.memory).toBeDefined();
    expect(cache.adapters.cache).toBeDefined();
    expect(eventStream.adapters.eventStream).toBeDefined();
    expect(interrupt.adapters.interrupt).toBeDefined();
    expect(trace.adapters.trace).toBeDefined();
    expect(indexing.adapters.indexing).toBeDefined();
    expect(queryEngine.adapters.queryEngine).toBeDefined();
    expect(responseSynthesizer.adapters.responseSynthesizer).toBeDefined();
  });

  it("passes through plugin options", () => {
    const plugin = Adapter.plugin({
      key: `${CUSTOM_PREFIX}.plugin`,
      adapters: { tools: [{ name: "tool" }] },
      mode: "override",
      overrideKey: "override.key",
    });

    expect(plugin.mode).toBe("override");
    expect(plugin.overrideKey).toBe("override.key");
  });
});
