import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../workflow/helpers";
import { recipes } from "../../src/recipes";

describe("HITL recipe", () => {
  it("pauses when no decision is provided", () => {
    const runtime = recipes.hitl().build();
    const outcome = assertSyncOutcome(runtime.run({ input: "needs approval" }));

    expect(outcome.status).toBe("paused");
    if (outcome.status !== "paused") {
      throw new Error("Expected paused outcome.");
    }
    expect(outcome.token).toBeDefined();
  });
});
