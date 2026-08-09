import { describe, expect, test } from "bun:test";
import canonicalizeJson from "canonicalize";
import fc from "fast-check";
import { canonicalize, normalize, StrictJsonError } from "../src/public";

describe("canonicalize", () => {
  test("sorts keys, preserves array order and normalises negative zero", () => {
    expect(canonicalize({ z: -0, a: [3, 2, 1], nested: { y: true, x: null } })).toBe(
      '{"a":[3,2,1],"nested":{"x":null,"y":true},"z":0}',
    );
  });

  test("preserves dangerous property names in canonical bytes", () => {
    const source: Record<string, unknown> = {};
    for (const key of ["__proto__", "constructor", "prototype"]) {
      Object.defineProperty(source, key, {
        enumerable: true,
        value: key,
      });
    }

    expect(canonicalize(source)).toBe(
      '{"__proto__":"__proto__","constructor":"constructor","prototype":"prototype"}',
    );
  });

  test("uses UTF-16 property ordering and JSON primitive encoding", () => {
    const roundedBinary64 = Number("333333333.33333329");

    expect(canonicalize({ "😀": "pair", "\r": "control", a: 1 })).toBe(
      '{"\\r":"control","a":1,"😀":"pair"}',
    );
    expect(canonicalize([roundedBinary64, 4.5, 0.002, 1e-27])).toBe(
      "[333333333.3333333,4.5,0.002,1e-27]",
    );
    expect(canonicalize({ "0": null, "": "" })).toBe('{"":"","0":null}');
    expect(canonicalize({ "": { "0": 0, "": "" } })).toBe('{"":{"":"","0":0}}');
  });

  test("wraps serializer failures in the package-owned error contract", () => {
    expect(() => canonicalize(Number.NaN)).toThrow(StrictJsonError);
  });

  test("does not execute inherited array serialization or sorting hooks", () => {
    let toJsonReads = 0;
    const originalToJson = Object.getOwnPropertyDescriptor(Array.prototype, "toJSON");
    const originalSort = Object.getOwnPropertyDescriptor(Array.prototype, "sort");
    let output = "";
    try {
      Object.defineProperty(Array.prototype, "toJSON", {
        configurable: true,
        get: () => {
          toJsonReads += 1;
          return () => "ambient";
        },
      });
      Object.defineProperty(Array.prototype, "sort", {
        configurable: true,
        value: () => {
          throw new Error("ambient sort must not run");
        },
      });
      output = canonicalize({ z: [2, 1], a: true });
    } finally {
      if (originalToJson) Object.defineProperty(Array.prototype, "toJSON", originalToJson);
      else delete (Array.prototype as { toJSON?: unknown }).toJSON;
      if (originalSort) Object.defineProperty(Array.prototype, "sort", originalSort);
    }

    expect(output).toBe('{"a":true,"z":[2,1]}');
    expect(toJsonReads).toBe(0);
  });

  test("is invariant to record insertion order for generated accepted values", () => {
    const value = fc.oneof(
      fc.boolean(),
      fc.integer({ max: 1_000_000, min: -1_000_000 }),
      fc.constant(null),
    );
    const record = fc.dictionary(fc.stringMatching(/^[a-z]{0,8}$/), value);

    fc.assert(
      fc.property(record, (input) => {
        const reversed = Object.fromEntries(Object.entries(input).reverse());
        expect(canonicalize(input)).toBe(canonicalize(reversed));
      }),
    );
  });

  test("matches the pinned OSS reference for generated accepted values", () => {
    const value = fc.jsonValue({ maxDepth: 4 }).filter((input) => {
      try {
        normalize(input);
        return true;
      } catch {
        return false;
      }
    });

    fc.assert(
      fc.property(value, (input) => {
        expect(canonicalize(input)).toBe(canonicalizeJson(input) as string);
      }),
    );
  });
});
