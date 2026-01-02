import { describe, expect, it } from "bun:test";
import { assertSyncOutcome } from "../workflow/helpers";
import { recipes } from "../../src/recipes";
import type { Model } from "../../src/adapters/types";

const createEvalModel = (): Model => ({
  generate: ({ prompt }) => ({ text: `candidate:${prompt ?? ""}` }),
});

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

describe("Eval recipe", () => {
  it("scores candidates and produces a report", () => {
    const model = createEvalModel();
    const runtime = recipes.eval().defaults({ adapters: { model } }).build();
    const outcome = assertSyncOutcome(
      runtime.run({
        prompt: "Check availability",
        candidates: 2,
        dataset: { rows: ["row-1"] },
      }),
    );

    if (outcome.status !== "ok") {
      throw new Error("Expected ok outcome.");
    }
    const artefact = outcome.artefact as Record<string, unknown>;
    const candidates = readStringArray(artefact["eval.candidates"]);
    const scores = (artefact["eval.scores"] as number[]) ?? [];
    const winner = artefact["eval.winner"] as string | undefined;
    const report = artefact["eval.report"] as string | undefined;
    const rows = readStringArray(artefact["dataset.rows"]);

    expect(candidates.length).toBe(2);
    expect(scores.length).toBe(2);
    expect(winner).toBeDefined();
    expect(report).toContain("Winner");
    expect(rows).toEqual(["row-1"]);
  });
});
