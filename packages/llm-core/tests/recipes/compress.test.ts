import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../workflow/helpers";
import type { Model } from "../../src/adapters/types";
import { recipes } from "../../src/recipes";

const createModel = (): Model => ({
  generate: (call) => ({ text: `summary:${call.prompt ?? ""}` }),
});

describe("Compress pack", () => {
  it("summarizes input text", () => {
    const model = createModel();
    const runtime = recipes.compress().defaults({ adapters: { model } }).build();
    const outcome = assertSyncOutcome(runtime.run({ input: "long text" }));

    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const compress = (outcome.artefact as { compress?: { summary?: string } }).compress;
    expect(compress?.summary).toContain("summary:");
  });
});
