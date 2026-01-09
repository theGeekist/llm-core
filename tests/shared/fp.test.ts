import { describe, expect, it } from "bun:test";
import {
  bindFirst,
  bindUnsafe,
  curryK,
  identity,
  isFalse,
  isNull,
  mapArray,
  partialK,
  toArray,
  toFalse,
  toNull,
  toTrue,
} from "../../src/shared/fp";

describe("fp", () => {
  describe("identity", () => {
    it("returns the value", () => {
      const obj = {};
      expect(identity(obj)).toBe(obj);
    });
  });

  describe("constants and predicates", () => {
    it("toNull return null", () => expect(toNull()).toBeNull());
    it("toTrue returns true", () => expect(toTrue()).toBe(true));
    it("toFalse returns false", () => expect(toFalse()).toBe(false));

    it("isNull checks for null", () => {
      expect(isNull(null)).toBe(true);
      expect(isNull(undefined)).toBe(false);
      expect(isNull(false)).toBe(false);
    });

    it("isFalse checks for false", () => {
      expect(isFalse(false)).toBe(true);
      expect(isFalse(true)).toBe(false);
      expect(isFalse(null)).toBe(false);
    });
  });

  describe("toArray", () => {
    it("wraps single value", () => {
      expect(toArray("foo")).toEqual(["foo"]);
    });

    it("returns array as is", () => {
      expect(toArray(["foo"])).toEqual(["foo"]);
    });
  });

  describe("mapArray", () => {
    it("maps items", () => {
      expect(mapArray((x: number) => x * 2, [1, 2])).toEqual([2, 4]);
    });

    it("handles readonly arrays", () => {
      const input: readonly number[] = [1, 2];
      expect(mapArray((x) => x * 2, input)).toEqual([2, 4]);
    });
  });

  describe("bindUnsafe", () => {
    it("binds context to undefined", () => {
      function test(this: unknown) {
        return this;
      }
      const bound = bindUnsafe(test);
      expect(bound()).toBeUndefined();
    });

    it("binds arguments", () => {
      const add = (a: number, b: number) => a + b;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addTwo = bindUnsafe(add as any, 2) as (b: number) => number;
      expect(addTwo(3)).toBe(5);
    });
  });

  describe("partialK", () => {
    it("partially applies the first argument", () => {
      const add = (a: number, b: number) => a + b;
      const addFive = partialK(add, 5);
      expect(addFive(10)).toBe(15);
    });

    it("creates a factory when only function is provided", () => {
      const add = (a: number, b: number) => a + b;
      const factory = partialK(add);
      const addFive = factory(5);
      expect(addFive(10)).toBe(15);
    });
  });

  describe("curryK", () => {
    const add = (a: number, b: number) => a + b;

    it("executes immediately with all arguments", () => {
      expect(curryK(add, 1, 2)).toBe(3);
    });

    it("returns a function waiting for second argument", () => {
      const addOne = curryK(add, 1);
      expect(addOne(2)).toBe(3);
    });

    it("returns a factory waiting for first argument", () => {
      const factory = curryK(add);
      const addOne = factory(1);
      expect(addOne(2)).toBe(3);
    });
  });

  describe("bindFirst", () => {
    it("binds the first argument", () => {
      const sub = (a: number, b: number) => a - b;
      const subTen = bindFirst(sub, 10);
      expect(subTen(3)).toBe(7);
    });

    it("supports currying style", () => {
      const sub = (a: number, b: number) => a - b;
      const factory = bindFirst(sub);
      const subTen = factory(10);
      expect(subTen(3)).toBe(7);
    });
  });
});
