import { describe, expect, it } from "bun:test";
import { Adapter } from "#adapters";

describe("Adapter registration helpers", () => {
  it("builds a plugin with a single construct", () => {
    const plugin = Adapter.register("custom.retriever", "retriever", {
      retrieve: () => ({ documents: [] }),
    });
    expect(plugin.key).toBe("custom.retriever");
    expect(plugin.adapters.retriever).toBeDefined();
  });

  it("stores unknown constructs under constructs", () => {
    const plugin = Adapter.register("custom.thing", "mcp", { client: "ok" });
    expect(plugin.adapters.constructs).toEqual({ mcp: { client: "ok" } });
  });

  it("treats constructs as the full constructs map", () => {
    const plugin = Adapter.register("custom.constructs", "constructs", { mcp: { client: "ok" } });
    expect(plugin.adapters.constructs).toEqual({ mcp: { client: "ok" } });
  });

  it("exposes value-first helpers", () => {
    const plugin = Adapter.model("custom.model", { generate: () => ({ text: "ok" }) });
    expect(plugin.adapters.model).toBeDefined();
  });
});
