import { describe, expect, test } from "bun:test";
import { deepFreeze, snapshot, type JsonValue } from "../src/public";

describe("snapshot", () => {
  test("returns a detached recursively frozen graph", () => {
    const source = { nested: { values: [1, 2, 3] } };
    const captured = snapshot(source) as {
      nested: { values: number[] };
    };

    expect(captured).toEqual(source);
    expect(captured).not.toBe(source);
    expect(captured.nested).not.toBe(source.nested);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.nested)).toBe(true);
    expect(Object.isFrozen(captured.nested.values)).toBe(true);

    source.nested.values.push(4);
    expect(captured.nested.values).toEqual([1, 2, 3]);
  });
});

describe("deepFreeze", () => {
  test("exposes deeply readonly output types", () => {
    const compileReadonlyContract = (): void => {
      const frozen = deepFreeze({ nested: [1, 2] });
      // @ts-expect-error frozen arrays cannot be mutated
      frozen.nested.push(3);
      // @ts-expect-error frozen record properties cannot be replaced
      frozen.nested = [];
    };
    expect(compileReadonlyContract).toBeFunction();
  });

  test("terminates on accidental cycles and freezes the graph", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    const frozen = deepFreeze(cyclic as JsonValue) as { self: unknown };
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(frozen.self).toBe(frozen);
  });

  test("freezes non-enumerable data children without invoking accessors", () => {
    let getterReads = 0;
    const hidden = { nested: true };
    const value = Object.defineProperties(
      {},
      {
        computed: {
          enumerable: true,
          get: () => {
            getterReads += 1;
            return "hidden";
          },
        },
        hidden: {
          enumerable: false,
          value: hidden,
        },
      },
    );

    deepFreeze(value as JsonValue);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(hidden)).toBe(true);
    expect(getterReads).toBe(0);
  });

  test("traverses already-frozen containers to freeze mutable descendants", () => {
    const child = { mutable: true };
    const parent = Object.freeze({ child });

    deepFreeze(parent);

    expect(Object.isFrozen(child)).toBe(true);
  });
});
