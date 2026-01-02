import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../workflow/helpers";
import { recipes } from "../../src/recipes";
import type { Model } from "../../src/adapters/types";

const createLoopModel = (): Model => ({
  generate: () => ({ text: "loop-response" }),
});

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

describe("Loop recipe", () => {
  it("iterates and finalizes with a model result", () => {
    const model = createLoopModel();
    const runtime = recipes.loop().defaults({ adapters: { model } }).build();
    const outcome = assertSyncOutcome(runtime.run({ input: "ping", maxIterations: 3 }));

    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const artefact = outcome.artefact as Record<string, unknown>;
    const iterations = readStringArray(artefact["loop.iterations"]);
    const result = artefact["loop.result"] as string | undefined;
    const reason = artefact["loop.terminationReason"] as string | undefined;

    expect(iterations.length).toBe(3);
    expect(result).toBe("loop-response");
    expect(reason).toBe("completed");
  });
});
