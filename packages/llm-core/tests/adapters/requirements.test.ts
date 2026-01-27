import { describe, expect, it } from "bun:test";
import type { AdapterBundle, Retriever } from "#adapters";
import { readAdapterRequirements, validateAdapterRequirements } from "#adapters";

describe("Adapter requirements", () => {
  it("reports missing construct requirements", () => {
    const retriever: Retriever = {
      retrieve: (query) => ({ query, documents: [] }),
      metadata: { requires: [{ kind: "construct", name: "model" }] },
    };
    const adapters: AdapterBundle = { retriever };
    const diagnostics = validateAdapterRequirements(adapters, {}, { retriever: "provider" });

    expect(diagnostics[0]?.message).toContain("requires construct");
  });

  it("skips construct diagnostics when requirements are met", () => {
    const retriever: Retriever = {
      retrieve: (query) => ({ query, documents: [] }),
      metadata: { requires: [{ kind: "construct", name: "model" }] },
    };
    const adapters: AdapterBundle = {
      retriever,
      model: { generate: () => ({ text: "ok" }) },
    };
    const diagnostics = validateAdapterRequirements(adapters, {}, { retriever: "provider" });

    expect(diagnostics).toHaveLength(0);
  });

  it("reports missing capability requirements", () => {
    const retriever: Retriever = {
      retrieve: (query) => ({ query, documents: [] }),
      metadata: { requires: [{ kind: "capability", name: "tools" }] },
    };
    const adapters: AdapterBundle = { retriever, tools: [] };
    const diagnostics = validateAdapterRequirements(adapters, {}, { retriever: "provider" });

    expect(diagnostics[0]?.message).toContain("requires capability");
  });

  it("reads requirements from custom constructs", () => {
    const adapters: AdapterBundle = {};
    const constructs = {
      custom: { metadata: { requires: [{ kind: "construct", name: "model" }] } },
    };
    const sources = readAdapterRequirements(adapters, constructs, {});
    expect(sources[0]?.construct).toBe("custom");
  });
});
