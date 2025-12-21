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

  it("collects unknown capability keys into arrays", () => {
    const plugins: Plugin[] = [
      { key: "custom.one", capabilities: { custom: "one" } },
      { key: "custom.two", capabilities: { custom: "two" } },
    ];

    const snapshot = buildCapabilities(plugins);
    expect(snapshot.resolved.custom).toEqual(["one", "two"]);
    expect(snapshot.declared.custom).toEqual(["one", "two"]);
  });
});
