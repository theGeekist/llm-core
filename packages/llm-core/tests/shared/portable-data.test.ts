import { describe, expect, test } from "bun:test";
import { cloneFrozen, hasOnlyKeys, isPortableRecord } from "../../src/shared/portable-data";

describe("portable data primitives", () => {
  test("accepts ordinary and null-prototype records but rejects inherited shapes", () => {
    expect(isPortableRecord({ value: 1 })).toBe(true);
    expect(isPortableRecord(Object.assign(Object.create(null), { value: 1 }))).toBe(true);
    expect(isPortableRecord(Object.create({ value: 1 }))).toBe(false);
    expect(isPortableRecord(new (class RecordLike {})())).toBe(false);
  });

  test("requires own required keys and rejects undeclared keys", () => {
    const inheritedRequired = Object.create({ required: true }) as Record<string, unknown>;
    expect(isPortableRecord(inheritedRequired)).toBe(false);
    expect(hasOnlyKeys(inheritedRequired, ["required"])).toBe(false);
    expect(hasOnlyKeys({ required: true, optional: 1 }, ["required"], ["optional"])).toBe(true);
    expect(hasOnlyKeys({ required: true, undeclared: 1 }, ["required"])).toBe(false);
  });

  test("rejects accessors without invoking them and normalizes hostile proxy traps", () => {
    let getterReads = 0;
    const accessor = Object.defineProperty({}, "required", {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return true;
      },
    });
    expect(isPortableRecord(accessor)).toBe(false);
    expect(hasOnlyKeys(accessor, ["required"])).toBe(false);
    expect(getterReads).toBe(0);

    const throwingProxy = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("hostile prototype trap");
        },
      },
    );
    expect(isPortableRecord(throwingProxy)).toBe(false);
    expect(hasOnlyKeys(throwingProxy, [])).toBe(false);

    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(isPortableRecord(proxy)).toBe(false);
    expect(hasOnlyKeys(proxy, [])).toBe(false);
  });

  test("clones and recursively freezes without retaining source ownership", () => {
    const source = { nested: { value: 1 } };
    const snapshot = cloneFrozen(source);
    source.nested.value = 2;

    expect(snapshot.nested.value).toBe(1);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nested)).toBe(true);
  });
});
