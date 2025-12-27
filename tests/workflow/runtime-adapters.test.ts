import { describe, expect, it } from "bun:test";
import { createBuiltinTrace, type AdapterBundle, type AdapterTraceEvent } from "#adapters";
import { getRecipe } from "#workflow/recipe-registry";
import {
  applyAdapterOverrides,
  buildResolvedCapabilities,
  readContractDiagnostics,
  toResolvedAdapters,
} from "../../src/workflow/runtime/adapters";

describe("Workflow runtime adapter helpers", () => {
  it("merges adapter overrides with constructs", () => {
    const base: AdapterBundle = { tools: [{ name: "base" }], constructs: { base: true } };
    const overrides: AdapterBundle = { tools: [{ name: "override" }], constructs: { extra: 1 } };
    const merged = applyAdapterOverrides(base, overrides);
    const name = merged.tools?.[0]?.name;
    expect(name).toBe("override");
    expect(merged.constructs).toEqual({ base: true, extra: 1 });
  });

  it("combines resolved constructs into adapter bundles", () => {
    const resolved = toResolvedAdapters({
      adapters: { constructs: { base: true } },
      constructs: { extra: 1 },
    });
    expect(resolved.constructs).toEqual({ base: true, extra: 1 });
  });

  it("derives event streams from trace sinks when missing", async () => {
    const trace = createBuiltinTrace();
    const resolved = toResolvedAdapters({
      adapters: { trace, constructs: {} },
      constructs: {},
    });
    const event: AdapterTraceEvent = { name: "run.start", timestamp: Date.now() };
    await resolved.eventStream?.emit(event);
    expect(trace.events).toContainEqual(event);
  });

  it("derives runtime capabilities from adapter presence", () => {
    const declared = { tools: ["explicit"] };
    const adapters: AdapterBundle = { tools: [{ name: "tool" }], constructs: {} };
    const capabilities = buildResolvedCapabilities(declared, adapters);
    expect(capabilities.tools).toBeDefined();
  });

  it("reports missing contract capabilities", () => {
    const contract = getRecipe("agent");
    if (!contract) {
      throw new Error("Expected agent contract to exist.");
    }
    const diagnostics = readContractDiagnostics({}, contract, { constructs: {} });
    expect(diagnostics.map((entry) => entry.message)).toContain(
      'Recipe "agent" requires capability "model".',
    );
  });
});
