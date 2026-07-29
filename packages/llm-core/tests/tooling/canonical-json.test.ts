import { describe, expect, test } from "bun:test";
import { canonicalizeJson, normalizeStrictJson } from "../../src/features/tooling/public";

describe("strict canonical JSON", () => {
  test("sorts object keys, preserves array order and normalizes negative zero", () => {
    expect(canonicalizeJson({ z: -0, a: [3, 2, 1], nested: { y: true, x: null } })).toBe(
      '{"a":[3,2,1],"nested":{"x":null,"y":true},"z":0}',
    );
  });

  test.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    1n,
    undefined,
    Symbol("native"),
    () => "native",
    new Date(),
    "\ud800",
    "\udc00",
  ])("rejects non-canonical input %#", (value) => {
    expect(() => canonicalizeJson(value)).toThrow(TypeError);
  });

  test("rejects cycles, sparse arrays, accessors and symbol-keyed data", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const sparse = new Array(2);
    sparse[1] = "value";
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => "hidden",
    });
    const symbolKey = { [Symbol("native")]: "hidden" };

    for (const value of [cyclic, sparse, accessor, symbolKey]) {
      expect(() => normalizeStrictJson(value)).toThrow(TypeError);
    }
  });

  test("rejects lone surrogates in object keys without rejecting valid pairs", () => {
    expect(() => canonicalizeJson({ ["bad\ud800"]: true })).toThrow(TypeError);
    expect(canonicalizeJson({ "face😀": true })).toBe('{"face😀":true}');
  });
});
