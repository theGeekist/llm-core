import { describe, expect, test } from "bun:test";

import {
  coverageBaselineEvolutionErrors,
  coverageRegressed,
  parseLcovSummary,
} from "./check-coverage-baseline";

describe("coverage baseline", () => {
  test("aggregates line, function and branch totals across source records", () => {
    const summary = parseLcovSummary(`
TN:
SF:first.ts
FNF:2
FNH:1
BRF:4
BRH:3
LF:10
LH:8
end_of_record
SF:second.ts
FNF:2
FNH:2
BRF:6
BRH:5
LF:10
LH:9
end_of_record
`);

    expect(summary).toEqual({
      version: 1,
      branches: { found: 10, hit: 8, percentage: 80 },
      functions: { found: 4, hit: 3, percentage: 75 },
      lines: { found: 20, hit: 17, percentage: 85 },
    });
  });

  test("reports branch coverage as unavailable when Bun emits no branch counters", () => {
    const summary = parseLcovSummary("FNF:2\nFNH:1\nLF:10\nLH:8\n");

    expect(summary.branches).toBeNull();
  });

  test("detects an exact ratio regression hidden by two-decimal rounding", () => {
    expect(
      coverageRegressed(
        { found: 20_001, hit: 10_000, percentage: 50 },
        { found: 20_000, hit: 10_000, percentage: 50 },
      ),
    ).toBe(true);
  });

  test("rejects a candidate baseline lower than its trusted Git baseline", () => {
    const trusted = {
      version: 1,
      branches: null,
      functions: { found: 100, hit: 90, percentage: 90 },
      lines: { found: 100, hit: 80, percentage: 80 },
    } as const;
    const lowered = {
      ...trusted,
      lines: { found: 100, hit: 79, percentage: 79 },
    } as const;

    expect(coverageBaselineEvolutionErrors(lowered, trusted, { revision: "a".repeat(40) })).toEqual(
      ["lines coverage regressed from 80% to 79%"],
    );
    expect(coverageBaselineEvolutionErrors(trusted, trusted, { revision: "a".repeat(40) })).toEqual(
      [],
    );
  });

  test("restricts the one-time coverage bootstrap to its exact base and digest", () => {
    const candidate = {
      version: 1,
      branches: null,
      functions: { found: 100, hit: 90, percentage: 90 },
      lines: { found: 100, hit: 80, percentage: 80 },
    } as const;

    expect(
      coverageBaselineEvolutionErrors(candidate, undefined, {
        candidateSha256: "wrong",
        revision: "a".repeat(40),
      }),
    ).toHaveLength(1);
    expect(
      coverageBaselineEvolutionErrors(candidate, undefined, {
        candidateSha256: "da4f678bf364cb992641311dd9ea20202a4536f67c7fbf26141aa642a7fd9e38",
        revision: "e9399df47cb2f9018f7aa8c74f5592972c63b3d5",
      }),
    ).toEqual([]);
  });

  test("rejects zero-denominator metrics before ratio comparison", () => {
    const trusted = {
      version: 1,
      branches: null,
      functions: { found: 100, hit: 90, percentage: 90 },
      lines: { found: 100, hit: 80, percentage: 80 },
    } as const;
    const bypass = {
      ...trusted,
      functions: { found: 0, hit: 0, percentage: 100 },
      lines: { found: 0, hit: 0, percentage: 100 },
    } as const;

    expect(coverageBaselineEvolutionErrors(bypass, trusted, { revision: "a".repeat(40) })).toEqual([
      "candidate functions found must be a positive safe integer",
      "candidate lines found must be a positive safe integer",
    ]);
  });
});
