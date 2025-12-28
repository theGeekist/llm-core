import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../workflow/helpers";
import { HitlPack } from "../../src/recipes/hitl";
import { createHitlRecipe, hitlRecipe } from "../../src/recipes/hitl";
import { createDefaultReporter } from "../../src/workflow/extensions";
import { recipes } from "../../src/recipes";
import type { HitlGateInput } from "../../src/workflow/types";

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

  it("returns ok when a decision is provided", () => {
    const runtime = recipes.hitl().build();
    const input = { input: "approve", decision: "approve" } as HitlGateInput & {
      decision: string;
    };
    const outcome = assertSyncOutcome(runtime.run(input));

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const hitl = (outcome.artefact as { hitl?: { status?: string } }).hitl;
    expect(hitl?.status).toBe("approved");
  });

  it("reuses existing hitl state when present", () => {
    const reporter = createDefaultReporter();
    const state: Record<string, unknown> = { hitl: { status: "pending" } };
    const step = HitlPack.steps[0];

    if (!step) {
      throw new Error("Expected hitl step.");
    }

    const result = step.apply({
      context: { reporter },
      input: { decision: "deny" },
      state,
      reporter,
    });

    if (result && typeof result === "object" && "paused" in result) {
      throw new Error("Expected non-paused result.");
    }
    const hitl = state.hitl as { status?: string };
    expect(hitl.status).toBe("denied");
  });

  it("pauses when input is not an object", () => {
    const reporter = createDefaultReporter();
    const state: Record<string, unknown> = {};
    const step = HitlPack.steps[0];

    if (!step) {
      throw new Error("Expected hitl step.");
    }

    const result = step.apply({
      context: { reporter },
      input: "needs decision",
      state,
      reporter,
    });

    if (!result || typeof result !== "object" || !("paused" in result)) {
      throw new Error("Expected paused result.");
    }
    expect(result.paused).toBe(true);
  });

  it("plans hitl recipes with config defaults", () => {
    const recipe = createHitlRecipe({ defaults: { adapters: {} } });
    const plan = recipe.plan();

    expect(plan.steps.length).toBe(1);
  });

  it("exposes a hitl recipe helper", () => {
    const plan = recipes.hitl().plan();
    expect(plan.steps.length).toBe(1);
  });

  it("exposes a hitl recipe factory", () => {
    const plan = hitlRecipe().plan();
    expect(plan.steps.length).toBe(1);
  });
});
