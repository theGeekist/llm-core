import { describe, expect, it } from "bun:test";
import { combineTriStates, normalizeTriState } from "../../src/shared/tri-state";

describe("tri-state aggregation", () => {
  it.each([
    [[], null],
    [[true, true], true],
    [[true, null], true],
    [[null, true], true],
    [[true, false], false],
    [[null, false], false],
    [[false, null], false],
    [[false, true], false],
  ] as const)("combines %j as %s", (values, expected) => {
    expect(combineTriStates([...values])).toBe(expected);
  });

  it.each([
    [false, false],
    [null, null],
    [true, true],
    [undefined, true],
    [0, true],
  ] as const)("normalizes %j as %s", (value, expected) => {
    expect(normalizeTriState(value)).toBe(expected);
  });
});
