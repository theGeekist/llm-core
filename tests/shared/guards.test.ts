import { describe, expect, it } from "bun:test";
import { hasKeys, isArray, isNonEmptyArray, isRecord, isString } from "../../src/shared/guards";

describe("guards", () => {
  describe("isRecord", () => {
    it("returns true for objects", () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });

    it("returns false for everything else", () => {
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord(1)).toBe(false);
      expect(isRecord("string")).toBe(false);
      expect(isRecord([])).toBe(false);
    });
  });

  describe("hasKeys", () => {
    it("returns true if record has keys", () => {
      expect(hasKeys({ a: 1 })).toBe(true);
    });

    it("returns false if record is empty", () => {
      expect(hasKeys({})).toBe(false);
    });
  });

  describe("isString", () => {
    it("returns true for strings", () => {
      expect(isString("foo")).toBe(true);
      expect(isString("")).toBe(true);
    });

    it("returns false for non-strings", () => {
      expect(isString(1)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString({})).toBe(false);
    });
  });

  describe("isArray", () => {
    it("returns true for arrays", () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1])).toBe(true);
    });

    it("returns false for non-arrays", () => {
      expect(isArray({})).toBe(false);
      expect(isArray(null)).toBe(false);
    });
  });

  describe("isNonEmptyArray", () => {
    it("returns false for empty arrays", () => {
      expect(isNonEmptyArray([])).toBe(false);
    });

    it("returns false for non-arrays", () => {
      expect(isNonEmptyArray(null)).toBe(false);
      expect(isNonEmptyArray({})).toBe(false);
    });

    it("returns true for non-empty arrays without validator", () => {
      expect(isNonEmptyArray([1])).toBe(true);
      expect(isNonEmptyArray([undefined])).toBe(true);
    });

    it("validates elements with provided validator", () => {
      const isNumber = (x: unknown): x is number => typeof x === "number";

      expect(isNonEmptyArray([1, 2], isNumber)).toBe(true);
      expect(isNonEmptyArray([1, "2"], isNumber)).toBe(false);
      expect(isNonEmptyArray([], isNumber)).toBe(false);
    });
  });
});
