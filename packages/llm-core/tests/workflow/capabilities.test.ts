import { describe, expect, it } from "bun:test";
import { buildCapabilities } from "../../src/workflow/capabilities";
import type { Plugin } from "#workflow/types";

describe("Workflow capabilities", () => {
  it("merges array capabilities for tools", () => {
    const plugins: Plugin[] = [
      { key: "tools.one", capabilities: { tools: ["a"] } },
      { key: "tools.two", capabilities: { tools: ["b"] } },
      { key: "tools.three", capabilities: { tools: "c" } },
    ];

    const snapshot = buildCapabilities(plugins);
    expect(snapshot.resolved.tools).toEqual(["a", "b", "c"]);
    expect(snapshot.declared.tools).toEqual(["a", "b", "c"]);
  });

  it("merges explicit tool lists across plugins", () => {
    const plugins: Plugin[] = [
      { key: "tools.one", capabilities: { tools: ["a"] } },
      { key: "tools.two", capabilities: { tools: ["b"] } },
    ];

    const snapshot = buildCapabilities(plugins);
    expect(snapshot.resolved.tools).toEqual(["a", "b"]);
    expect(snapshot.declared.tools).toEqual(["a", "b"]);
  });

  it("collects unknown capability keys into arrays", () => {
    const plugins: Plugin[] = [
      { key: "custom.one", capabilities: { custom: "one" } },
      { key: "custom.two", capabilities: { custom: "two" } },
    ];

    const snapshot = buildCapabilities(plugins);
    expect(snapshot.resolved.custom).toEqual(["one", "two"]);
    expect(snapshot.declared.custom).toEqual(["one", "two"]);
  });

  it("derives capabilities from adapters", () => {
    const embedder = {
      embed: () => [0.1, 0.2],
    };
    const retriever = {
      retrieve: async () => ({ documents: [] }),
    };
    const plugins: Plugin[] = [
      { key: "adapter.embedder", adapters: { embedder } },
      { key: "adapter.retriever", adapters: { retriever } },
    ];

    const snapshot = buildCapabilities(plugins);
    expect(snapshot.resolved.embedder).toBe(embedder);
    expect(snapshot.declared.embedder).toBe(embedder);
    expect(snapshot.resolved.retriever).toBe(retriever);
    expect(snapshot.declared.retriever).toBe(retriever);
  });

  it("preserves explicit capabilities over adapters", () => {
    const embedder = {
      embed: () => [0.1, 0.2],
    };
    const plugins: Plugin[] = [
      { key: "explicit.embedder", capabilities: { embedder: "explicit" } },
      { key: "adapter.embedder", adapters: { embedder } },
    ];

    const snapshot = buildCapabilities(plugins);
    expect(snapshot.resolved.embedder).toBe("explicit");
    expect(snapshot.declared.embedder).toBe("explicit");
  });

  it("uses presence flags for list-like adapter capabilities", () => {
    const tools = [{ name: "tool" }];
    const documents = [{ text: "doc" }];
    const plugins: Plugin[] = [{ key: "adapter.lists", adapters: { tools, documents } }];

    const snapshot = buildCapabilities(plugins);
    expect(snapshot.resolved.tools).toBe(true);
    expect(snapshot.declared.tools).toBe(true);
    expect(snapshot.resolved.documents).toBe(true);
    expect(snapshot.declared.documents).toBe(true);
  });

  it("keeps explicit tool lists even when adapter presence is first", () => {
    const plugins: Plugin[] = [
      { key: "adapter.tools", adapters: { tools: [{ name: "adapter" }] } },
      { key: "explicit.tools", capabilities: { tools: ["explicit"] } },
    ];

    const snapshot = buildCapabilities(plugins);
    expect(snapshot.resolved.tools).toEqual(["explicit"]);
    expect(snapshot.declared.tools).toEqual(["explicit"]);
  });
});
