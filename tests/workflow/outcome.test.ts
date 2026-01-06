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
    const paused: OutcomeType<{ answer: string }> = {
      status: "paused",
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
        paused: () => "human",
        error: () => "error",
      }),
    ).toBe("ok");

    expect(
      Outcome.match<{ answer: string }, string>(paused, {
        ok: () => "ok",
        paused: (value) => String(value.token),
        error: () => "error",
      }),
    ).toBe("token");

    expect(
      Outcome.match<{ answer: string }, string>(error, {
        ok: () => "ok",
        paused: () => "human",
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
    const paused: OutcomeType<{ value: number }> = {
      status: "paused",
      token: "token",
      artefact: { value: 0 },
      trace: [],
      diagnostics: [],
    };

    const mapped = Outcome.mapOk(ok, (artefact) => ({ value: artefact.value * 2 }));
    if (mapped.status === "ok") {
      expect(mapped.artefact).toEqual({ value: 4 });
    }

    const untouched = Outcome.mapOk(paused, () => ({ value: 0 }));
    expect(untouched).toBe(paused);
  });

  it("throws for unexpected outcome statuses", () => {
    const invalid = {
      status: "unknown",
      trace: [],
      diagnostics: [],
    } as unknown as OutcomeType<unknown>;

    expect(() =>
      Outcome.match(invalid, {
        ok: () => "ok",
        paused: () => "paused",
        error: () => "error",
      }),
    ).toThrow("Unexpected outcome status.");
  });
});
