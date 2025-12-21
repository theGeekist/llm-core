import { describe, expect, it } from "bun:test";
import { Outcome } from "#workflow";
import type { Outcome as OutcomeType } from "#workflow/types";

describe("Workflow Outcome helpers", () => {
  it("identifies ok outcomes", () => {
    const outcome: OutcomeType<{ answer: string }> = {
      status: "ok",
      artefact: { answer: "ok" },
      trace: [],
      diagnostics: [],
    };

    expect(Outcome.ok(outcome)).toBe(true);
  });

  it("matches all outcome branches", () => {
    const ok: OutcomeType<{ answer: string }> = {
      status: "ok",
      artefact: { answer: "ok" },
      trace: [],
      diagnostics: [],
    };
    const needsHuman: OutcomeType<{ answer: string }> = {
      status: "needsHuman",
      token: "token",
      artefact: { answer: "draft" },
      trace: [],
      diagnostics: [],
    };
    const error: OutcomeType<{ answer: string }> = {
      status: "error",
      error: new Error("boom"),
      trace: [],
      diagnostics: [],
    };

    expect(
      Outcome.match<{ answer: string }, string>(ok, {
        ok: (value) => value.artefact.answer,
        needsHuman: () => "human",
        error: () => "error",
      }),
    ).toBe("ok");

    expect(
      Outcome.match<{ answer: string }, string>(needsHuman, {
        ok: () => "ok",
        needsHuman: (value) => String(value.token),
        error: () => "error",
      }),
    ).toBe("token");

    expect(
      Outcome.match<{ answer: string }, string>(error, {
        ok: () => "ok",
        needsHuman: () => "human",
        error: (value) => (value.error instanceof Error ? value.error.message : "unknown"),
      }),
    ).toBe("boom");
  });

  it("maps ok artefacts without touching other outcomes", () => {
    const ok: OutcomeType<{ value: number }> = {
      status: "ok",
      artefact: { value: 2 },
      trace: [],
      diagnostics: [],
    };
    const needsHuman: OutcomeType<{ value: number }> = {
      status: "needsHuman",
      token: "token",
      artefact: { value: 0 },
      trace: [],
      diagnostics: [],
    };

    const mapped = Outcome.mapOk(ok, (artefact) => ({ value: artefact.value * 2 }));
    if (mapped.status === "ok") {
      expect(mapped.artefact).toEqual({ value: 4 });
    }

    const untouched = Outcome.mapOk(needsHuman, () => ({ value: 0 }));
    expect(untouched).toBe(needsHuman);
  });
});
