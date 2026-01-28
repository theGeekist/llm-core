import { describe, expect, it } from "bun:test";
import type { PipelineContext } from "#workflow/types";
import { getAdapters } from "#workflow";

describe("Workflow context helpers", () => {
  it("returns adapters from context", () => {
    const context = {
      adapters: { tools: [{ name: "search" }] },
    } as unknown as PipelineContext;

    expect(getAdapters(context)).toEqual({ tools: [{ name: "search" }] });
  });
});
