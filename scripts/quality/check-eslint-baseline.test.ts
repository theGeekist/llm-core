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
