import { describe, expect, test } from "bun:test";

import {
  baselineEvolutionErrors,
  compareAnchors,
  exactBaselineErrors,
  suppressionAnchor,
  warningAnchor,
} from "./check-eslint-baseline";

const message = {
  column: 3,
  line: 2,
  message: "Reduce this function's Cognitive Complexity.",
  ruleId: "sonarjs/cognitive-complexity",
  severity: 1,
} as const;

const cognitiveComplexityMessage = (complexity: number, allowed: number): string =>
  `Refactor this function to reduce its Cognitive Complexity from ${complexity} to the ${allowed} allowed.`;

const cognitiveComplexityDiagnostic = (complexity: number, allowed: number) => ({
  ...message,
  message: cognitiveComplexityMessage(complexity, allowed),
});

const cognitiveComplexityTightening = {
  candidate: 10,
  trusted: 15,
} as const;

describe("ESLint debt anchors", () => {
  test("binds a warning to its exact source location and diagnostic", () => {
    const original = warningAnchor("src/example.ts", message, "first();\ncomplex();\n");
    const moved = warningAnchor(
      "src/example.ts",
      { ...message, line: 3 },
      "first();\ninserted();\ncomplex();\n",
    );

    expect(moved).not.toBe(original);
    expect(compareAnchors("warning", { [moved]: 1 }, { [original]: 1 })).toEqual([
      `warning ${moved} increased from 0 to 1`,
    ]);
  });

  test("binds a suppression to the complete containing file", () => {
    const original = suppressionAnchor("src/example.ts", message, "/* eslint-disable */\nrun();\n");
    const expanded = suppressionAnchor(
      "src/example.ts",
      message,
      "/* eslint-disable */\nrun();\nnewDebt();\n",
    );

    expect(expanded).not.toBe(original);
    expect(compareAnchors("suppression", { [expanded]: 1 }, { [original]: 1 })).toHaveLength(1);
  });

  test("allows anchored debt to disappear but never duplicate", () => {
    const anchor = warningAnchor("src/example.ts", message, "first();\ncomplex();\n");
    expect(compareAnchors("warning", {}, { [anchor]: 1 })).toEqual([]);
    expect(compareAnchors("warning", { [anchor]: 2 }, { [anchor]: 1 })).toEqual([
      `warning ${anchor} increased from 1 to 2`,
    ]);
  });

  test("compares candidate debt with the trusted Git baseline", () => {
    const original = warningAnchor("src/example.ts", message, "first();\ncomplex();\n");
    const moved = warningAnchor(
      "src/example.ts",
      { ...message, line: 3 },
      "first();\ninserted();\ncomplex();\n",
    );
    const trusted = {
      version: 2,
      eslint: "10.9.0",
      suppressions: {},
      warnings: { [original]: 1 },
    } as const;

    expect(
      baselineEvolutionErrors({ ...trusted, warnings: { [moved]: 1 } }, trusted, {
        revision: "a".repeat(40),
      }),
    ).toEqual([`trusted warning ${moved} increased from 0 to 1`]);
    expect(
      baselineEvolutionErrors({ ...trusted, warnings: {} }, trusted, { revision: "a".repeat(40) }),
    ).toEqual([]);
  });

  test("reconciles existing cognitive-complexity anchors across a threshold tightening", () => {
    const source = "const complex = (): void => run();\n";
    const warningAtFifteen = warningAnchor(
      "src/example.ts",
      cognitiveComplexityDiagnostic(16, 15),
      source,
    );
    const warningAtTen = warningAnchor(
      "src/example.ts",
      cognitiveComplexityDiagnostic(16, 10),
      source,
    );
    const suppressionAtFifteen = suppressionAnchor(
      "src/example.ts",
      cognitiveComplexityDiagnostic(16, 15),
      source,
    );
    const suppressionAtTen = suppressionAnchor(
      "src/example.ts",
      cognitiveComplexityDiagnostic(16, 10),
      source,
    );
    const trusted = {
      version: 2,
      eslint: "10.9.0",
      suppressions: { [suppressionAtFifteen]: 1 },
      warnings: { [warningAtFifteen]: 1 },
    } as const;

    expect(
      baselineEvolutionErrors(
        {
          ...trusted,
          suppressions: { [suppressionAtTen]: 1 },
          warnings: { [warningAtTen]: 1 },
        },
        trusted,
        {
          cognitiveComplexityThresholds: cognitiveComplexityTightening,
          revision: "a".repeat(40),
        },
      ),
    ).toEqual([]);
  });

  test("permits only newly exposed cognitive complexity within the tightened band", () => {
    const source = "const complex = (): void => run();\n";
    const warning = warningAnchor("src/example.ts", cognitiveComplexityDiagnostic(11, 10), source);
    const suppression = suppressionAnchor(
      "src/example.ts",
      cognitiveComplexityDiagnostic(15, 10),
      source,
    );
    const trusted = {
      version: 2,
      eslint: "10.9.0",
      suppressions: {},
      warnings: {},
    } as const;
    const candidate = {
      ...trusted,
      suppressions: { [suppression]: 1 },
      warnings: { [warning]: 1 },
    };

    expect(
      baselineEvolutionErrors(candidate, trusted, {
        cognitiveComplexityThresholds: cognitiveComplexityTightening,
        revision: "a".repeat(40),
      }),
    ).toEqual([]);
    expect(
      baselineEvolutionErrors(candidate, trusted, {
        cognitiveComplexityThresholds: { candidate: 12, trusted: 12 },
        revision: "a".repeat(40),
      }),
    ).toEqual([
      `trusted warning ${warning} increased from 0 to 1`,
      `trusted suppression ${suppression} increased from 0 to 1`,
    ]);
  });

  test("permits a generic threshold tightening but rejects an equal or raised threshold", () => {
    const source = "const complex = (): void => run();\n";
    const newlyExposed = warningAnchor(
      "src/example.ts",
      cognitiveComplexityDiagnostic(7, 6),
      source,
    );
    const trusted = {
      version: 2,
      eslint: "10.9.0",
      suppressions: {},
      warnings: {},
    } as const;
    const candidate = { ...trusted, warnings: { [newlyExposed]: 1 } };

    expect(
      baselineEvolutionErrors(candidate, trusted, {
        cognitiveComplexityThresholds: { candidate: 6, trusted: 8 },
        revision: "a".repeat(40),
      }),
    ).toEqual([]);
    for (const thresholds of [
      { candidate: 6, trusted: 6 },
      { candidate: 8, trusted: 6 },
    ] as const) {
      expect(
        baselineEvolutionErrors(candidate, trusted, {
          cognitiveComplexityThresholds: thresholds,
          revision: "a".repeat(40),
        }),
      ).toEqual([`trusted warning ${newlyExposed} increased from 0 to 1`]);
    }
  });

  test("rejects unrelated or above-band debt during the threshold tightening", () => {
    const source = "const complex = (): void => run();\n";
    const aboveBand = warningAnchor(
      "src/example.ts",
      cognitiveComplexityDiagnostic(16, 10),
      source,
    );
    const unrelated = suppressionAnchor("src/example.ts", message, source);
    const trusted = {
      version: 2,
      eslint: "10.9.0",
      suppressions: {},
      warnings: {},
    } as const;
    const candidate = {
      ...trusted,
      suppressions: { [unrelated]: 1 },
      warnings: { [aboveBand]: 1 },
    };

    expect(
      baselineEvolutionErrors(candidate, trusted, {
        cognitiveComplexityThresholds: cognitiveComplexityTightening,
        revision: "a".repeat(40),
      }),
    ).toEqual([
      `trusted warning ${aboveBand} increased from 0 to 1`,
      `trusted suppression ${unrelated} increased from 0 to 1`,
    ]);
  });

  test("fails closed for malformed cognitive-complexity anchors", () => {
    const malformed = JSON.stringify([
      "src/example.ts",
      1,
      1,
      "sonarjs/cognitive-complexity",
      cognitiveComplexityMessage(11, 10),
    ]);
    const trusted = {
      version: 2,
      eslint: "10.9.0",
      suppressions: {},
      warnings: {},
    } as const;

    expect(
      baselineEvolutionErrors({ ...trusted, warnings: { [malformed]: 1 } }, trusted, {
        cognitiveComplexityThresholds: cognitiveComplexityTightening,
        revision: "a".repeat(40),
      }),
    ).toEqual([`trusted warning ${malformed} increased from 0 to 1`]);
  });

  test("restricts the one-time baseline bootstrap to its exact base and digest", () => {
    const candidate = {
      version: 2,
      eslint: "10.9.0",
      suppressions: {},
      warnings: {},
    } as const;

    expect(
      baselineEvolutionErrors(candidate, undefined, {
        candidateSha256: "wrong",
        revision: "a".repeat(40),
      }),
    ).toHaveLength(1);
    expect(
      baselineEvolutionErrors(candidate, undefined, {
        candidateSha256: "11c6ea54d2e4fff302135e56f2138da59e9b53b07a5996ae56af9426f45ea861",
        revision: "e9399df47cb2f9018f7aa8c74f5592972c63b3d5",
      }),
    ).toEqual([]);
  });

  test("rejects baseline anchors that do not match observed debt", () => {
    const observed = {
      version: 2,
      eslint: "10.9.0",
      suppressions: {},
      warnings: {},
    } as const;
    const unused = warningAnchor("src/future.ts", message, "first();\ncomplex();\n");

    expect(exactBaselineErrors(observed, observed)).toEqual([]);
    expect(exactBaselineErrors(observed, { ...observed, warnings: { [unused]: 1 } })).toEqual([
      `stale baseline warning ${unused} increased from 0 to 1`,
    ]);
    expect(exactBaselineErrors(observed, { ...observed, warnings: { [unused]: 0 } })).toEqual([
      `baseline warning ${unused} must have a positive safe-integer count`,
    ]);
    expect(exactBaselineErrors(observed, { ...observed, suppressions: { [unused]: -1 } })).toEqual([
      `baseline suppression ${unused} must have a positive safe-integer count`,
    ]);
  });
});
