import { describe, expect, it } from "bun:test";
import { curryK, partialK, tapMaybe } from "../src/maybe";

describe("Maybe utilities", () => {
  it("partialK binds the first argument", () => {
    const add = (left: number, right: number) => left + right;
    const addTwo = partialK(add, 2);
    expect(addTwo(3)).toBe(5);
  });

  it("curryK returns a nested function", () => {
    const multiply = (left: number, right: number) => left * right;
    const curried = curryK(multiply);
    expect(curried(4)(5)).toBe(20);
  });

  it("tapMaybe preserves the original value", () => {
    let seen = 0;
    const value = tapMaybe(7, (current) => {
      seen = current;
    });
    expect(value).toBe(7);
    expect(seen).toBe(7);
  });
});
