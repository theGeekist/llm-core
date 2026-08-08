import { describe, expect, it } from "bun:test";
import { bindFirst, compareUtf16CodeUnits, toArray, toFalse, toNull, toTrue } from "#shared/fp";
import { isNull } from "#shared/guards";

describe("fp", () => {
  describe("constants and predicates", () => {
    it("toNull return null", () => expect(toNull()).toBeNull());
    it("toTrue returns true", () => expect(toTrue()).toBe(true));
    it("toFalse returns false", () => expect(toFalse()).toBe(false));

    it("isNull checks for null", () => {
      expect(isNull(null)).toBe(true);
      expect(isNull(undefined)).toBe(false);
      expect(isNull(false)).toBe(false);
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

  describe("bindFirst", () => {
    it("binds the first argument", () => {
      const sub = (a: number, b: number) => a - b;
      const subTen = bindFirst(sub, 10);
      expect(subTen(3)).toBe(7);
    });
  });

  describe("compareUtf16CodeUnits", () => {
    it("preserves deterministic locale-neutral code-unit ordering", () => {
      expect(["éΔ", "e\u0301Δ", "eΔ"].sort(compareUtf16CodeUnits)).toEqual([
        "e\u0301Δ",
        "eΔ",
        "éΔ",
      ]);
    });
  });
});
