import { describe, expect, it } from "bun:test";
import type { Outcome } from "#workflow/types";
import type { StateValidationResult, StateValidator } from "../../src/recipes/state";
import { Recipe } from "../../src/recipes/flow";
import { wrapRuntimeWithStateValidation } from "../../src/recipes/state";
import { getRecipe } from "../../src/workflow/recipe-registry";
import type { WorkflowRuntime } from "../../src/workflow/types";
import { HitlPack } from "../../src/recipes/hitl";
import type { StepApply } from "../../src/recipes/flow";
import { diagnosticMessages } from "../workflow/helpers";
import { assertSyncOutcome } from "../workflow/helpers";

const stepSeed: StepApply = ({ state }) => {
  state.seeded = true;
  return null;
};

const expectOk = (outcome: Outcome) => {
  expect(outcome.status).toBe("ok");
  if (outcome.status !== "ok") {
    throw new Error("Expected ok outcome.");
  }
  return outcome;
};

describe("Recipe state validation", () => {
  it("adds diagnostics when validation fails", () => {
    const pack = Recipe.pack("state", ({ step }) => ({
      seed: step("seed", stepSeed),
    }));
    const validator = () => false;
    const runtime = Recipe.flow("rag").use(pack).state(validator).build();
    const outcome = assertSyncOutcome(runtime.run({ input: "x", query: "x" }));
    const ok = expectOk(outcome);

    const messages = diagnosticMessages(ok.diagnostics);
    expect(messages).toContain("Recipe state validation failed.");
  });

  it("captures invalid validator results as errors", () => {
    const pack = Recipe.pack("state", ({ step }) => ({
      seed: step("seed", ({ state }) => {
        state.invalid = "value";
        return null;
      }),
    }));
    const validator: StateValidator = (state) => state as StateValidationResult;
    const runtime = Recipe.flow("rag").use(pack).state(validator).build();
    const outcome = assertSyncOutcome(runtime.run({ input: "x", query: "x" }));
    const ok = expectOk(outcome);

    const isRecipeDiagnostic = (
      entry: unknown,
    ): entry is { kind: string; data?: { errors?: { code?: string; value?: unknown } } } =>
      !!entry && typeof entry === "object" && "kind" in entry;
    const diagnostic = ok.diagnostics.find(isRecipeDiagnostic);
    if (diagnostic && diagnostic.kind !== "recipe") {
      throw new Error("Expected recipe diagnostic.");
    }
    expect(diagnostic?.data?.errors).toEqual({
      code: "state_validator_invalid_result",
      value: { invalid: "value" },
    });
  });

  it("does not validate paused outcomes", () => {
    const validator = () => false;
    const runtime = Recipe.flow("hitl-gate").use(HitlPack).state(validator).build();
    const outcome = assertSyncOutcome(runtime.run({ input: "x", policy: "deny" }));

    expect(outcome.status).toBe("paused");
    if (outcome.status === "paused") {
      expect(outcome.diagnostics.length).toBe(0);
    }
  });

  it("validates resume outcomes when resume is available", async () => {
    const baseOutcome: Outcome<Record<string, unknown>> = {
      status: "ok",
      artefact: {},
      trace: [],
      diagnostics: [],
    };
    const contract = getRecipe("rag");
    if (!contract) {
      throw new Error("Expected rag recipe contract.");
    }
    const runtime: WorkflowRuntime<{ input: string }, Record<string, unknown>, string> = {
      run: () => baseOutcome,
      resume: () => baseOutcome,
      capabilities: () => ({}),
      declaredCapabilities: () => ({}),
      adapters: () => ({}),
      declaredAdapters: () => ({}),
      explain: () => ({
        plugins: [],
        capabilities: {},
        declaredCapabilities: {},
        overrides: [],
        unused: [],
      }),
      contract: () => contract,
    };
    const validator = () => false;
    const wrapped = wrapRuntimeWithStateValidation(runtime, validator);
    const outcome = wrapped.resume ? await wrapped.resume("token") : undefined;

    if (!outcome || outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    expect(outcome.diagnostics.length).toBeGreaterThan(0);
  });
});
