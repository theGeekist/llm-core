import { describe, expect, it } from "bun:test";
import {
  combineTriStates,
  maybeReduceTriState,
  normalizeTriState,
} from "../../src/shared/tri-state";

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

  it("reduces synchronous effects sequentially", () => {
    const visited: number[] = [];
    const result = maybeReduceTriState(
      (value: number) => {
        visited.push(value);
        return value === 2 ? false : true;
      },
      [1, 2, 3],
    );

    expect(result).toBe(false);
    expect(visited).toEqual([1, 2, 3]);
  });

  it("reduces asynchronous effects sequentially", async () => {
    const visited: number[] = [];
    const result = await maybeReduceTriState(
      async (value: number) => {
        await Promise.resolve();
        visited.push(value);
        return value === 1 ? null : true;
      },
      [1, 2],
    );

    expect(result).toBe(true);
    expect(visited).toEqual([1, 2]);
  });

  it("returns null without invoking the effect for an empty input", () => {
    let invoked = false;
    const result = maybeReduceTriState(() => {
      invoked = true;
      return true;
    }, []);

    expect(result).toBe(null);
    expect(invoked).toBe(false);
  });
});
