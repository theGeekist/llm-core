import { describe, expect, it } from "bun:test";
import type { Outcome } from "#workflow/types";
import { createMemoryCache } from "../../src/adapters";
import { type StepApply, Recipe } from "../../src/recipes/flow";
import { assertSyncOutcome } from "../workflow/helpers";

const appendOrder = (state: Record<string, unknown>, label: string) => {
  const order = Array.isArray(state.order) ? [...state.order] : [];
  order.push(label);
  state.order = order;
};

const expectOk = (outcome: Outcome) => {
  expect(outcome.status).toBe("ok");
  if (outcome.status !== "ok") {
    throw new Error("Expected ok outcome.");
  }
  return outcome;
};

const stepFirst: StepApply = ({ state }) => {
  appendOrder(state, "first");
};

const stepSecond: StepApply = ({ state }) => {
  appendOrder(state, "second");
};

const stepThird: StepApply = ({ state }) => {
  appendOrder(state, "third");
};

describe("Recipe flow packs", () => {
  it("runs pack steps in dependency order", () => {
    const pack = Recipe.pack("order", ({ step }) => ({
      first: step("first", stepFirst),
      second: step("second", stepSecond).dependsOn("first"),
    }));

    const workflow = Recipe.flow("rag").use(pack).build();
    const outcome = assertSyncOutcome(workflow.run({ input: "hello", query: "hello" }));
    const ok = expectOk(outcome);

    const order = (ok.artefact as { order?: unknown }).order;
    expect(order).toEqual(["first", "second"]);
  });

  it("honors cross-pack dependencies", () => {
    const packA = Recipe.pack("packA", ({ step }) => ({
      first: step("first", stepFirst),
    }));

    const packB = Recipe.pack("packB", ({ step }) => ({
      third: step("third", stepThird).dependsOn("packA.first"),
    }));

    const workflow = Recipe.flow("rag").use(packA).use(packB).build();
    const outcome = assertSyncOutcome(workflow.run({ input: "world", query: "world" }));
    const ok = expectOk(outcome);

    const order = (ok.artefact as { order?: unknown }).order;
    expect(order).toEqual(["first", "third"]);
  });

  it("applies pack defaults for adapters", () => {
    const cache = createMemoryCache();
    const pack = Recipe.pack(
      "defaults",
      ({ step }) => ({
        first: step("first", stepFirst),
      }),
      { defaults: { adapters: { cache } } },
    );

    const runtime = Recipe.flow("agent").use(pack).build();

    expect(runtime.declaredAdapters().cache).toBe(cache);
  });
});
