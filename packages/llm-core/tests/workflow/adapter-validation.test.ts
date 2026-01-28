import { describe, expect, it } from "bun:test";
import { hasAdapter, validateAdapters } from "#workflow/adapter-validation";
import type { AdapterBundle } from "#workflow";

describe("Workflow adapter validation", () => {
  it("detects presence for list adapters", () => {
    const adapters: AdapterBundle = {
      tools: [{ name: "tool" }],
      documents: [],
    };

    expect(hasAdapter(adapters, "tools")).toBe(true);
    expect(hasAdapter(adapters, "documents")).toBe(false);
  });

  it("returns missing adapter keys", () => {
    const adapters: AdapterBundle = {
      embedder: { embed: () => [0.1] },
      tools: [{ name: "tool" }],
    };

    const missing = validateAdapters(adapters, ["embedder", "retriever", "tools"]);
    expect(missing).toEqual(["retriever"]);
  });
});
