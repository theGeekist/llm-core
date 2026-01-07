import { describe, expect, it } from "bun:test";
import { Recipe, type RecipeStepPlan } from "../../src/recipes/flow";
import { recipes } from "../../src/recipes";

const noopStep = () => null;

const createPlanPack = () =>
  Recipe.pack("plan-pack", ({ step }) => ({
    seed: step("seed", noopStep).label("Seed input").kind("io").summary("Loads input into state"),
    run: step("run", noopStep).dependsOn("seed").label("Run"),
  }));

const readStepById = (steps: RecipeStepPlan[], id: string) => steps.find((step) => step.id === id);

describe("Recipe plan", () => {
  it("exposes step metadata and dependencies", () => {
    const pack = createPlanPack();
    const plan = recipes.rag().use(pack).explain();

    const seed = readStepById(plan.steps, "plan-pack.seed");
    const run = readStepById(plan.steps, "plan-pack.run");

    expect(seed?.label).toBe("Seed input");
    expect(seed?.kind).toBe("io");
    expect(seed?.summary).toBe("Loads input into state");
    expect(run?.dependsOn).toContain("plan-pack.seed");
  });
});
