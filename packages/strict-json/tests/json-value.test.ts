import { describe, expect, test } from "bun:test";
import { hasExactKeys, isRecord, normalize, StrictJsonError, type JsonValue } from "../src/public";

const expectCode = (run: () => unknown, code: StrictJsonError["code"]): void => {
  try {
    run();
    throw new Error("Expected strict-json rejection.");
  } catch (error) {
    expect(error).toBeInstanceOf(StrictJsonError);
    expect((error as StrictJsonError).code).toBe(code);
  }
};

describe("normalize", () => {
  test("normalises a detached, sorted JSON graph", () => {
    const source = { z: -0, a: [3, 2, 1], nested: { y: true, x: null } };
    const normalized = normalize(source);

    expect(normalized).toEqual({ a: [3, 2, 1], nested: { x: null, y: true }, z: 0 });
    expect(normalized).not.toBe(source);
    expect((normalized as { nested: unknown }).nested).not.toBe(source.nested);
    (source.nested as { x: unknown }).x = "changed";
    expect((normalized as { nested: { x: unknown } }).nested.x).toBeNull();
  });

  test.each([
    [Number.NaN, "non-finite-number"],
    [Number.POSITIVE_INFINITY, "non-finite-number"],
    [Number.MAX_SAFE_INTEGER + 1, "unsafe-integer"],
    [1n, "unsupported-type"],
    [undefined, "unsupported-type"],
    [Symbol("native"), "unsupported-type"],
    [() => "native", "unsupported-type"],
    [new Date(), "non-plain-object"],
    ["\ud800", "lone-surrogate"],
    ["\udc00", "lone-surrogate"],
  ] as const)("rejects invalid input %#", (value, code) => {
    expectCode(() => normalize(value), code);
  });

  test("rejects cycles, sparse arrays, symbols and extended arrays", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const sparse = new Array(2);
    sparse[1] = "value";
    const symbolRecord = { [Symbol("native")]: "hidden" };
    const extended = ["value"] as unknown[] & { label?: string };
    extended.label = "not-an-index";

    expectCode(() => normalize(cyclic), "cyclic-reference");
    expectCode(() => normalize(sparse), "sparse-array");
    expectCode(() => normalize(symbolRecord), "symbol-key");
    expectCode(() => normalize(extended), "non-index-array-property");
  });

  test("rejects custom prototypes and non-enumerable record properties", () => {
    const customArray = ["value"];
    Object.setPrototypeOf(customArray, Object.create(Array.prototype));
    const hidden = Object.defineProperty({}, "value", {
      enumerable: false,
      value: true,
    });

    expectCode(() => normalize(customArray), "non-plain-object");
    expectCode(() => normalize(hidden), "non-enumerable-property");
  });

  test("rejects accessors without invoking them or input array methods", () => {
    let getterReads = 0;
    const indexedAccessor: unknown[] = [];
    Object.defineProperty(indexedAccessor, "0", {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return "hidden";
      },
    });
    indexedAccessor.length = 1;
    const poisonedMap = ["safe"] as unknown[];
    Object.defineProperty(poisonedMap, "map", {
      enumerable: true,
      value: () => {
        throw new Error("must not run");
      },
    });

    expectCode(() => normalize(indexedAccessor), "non-data-property");
    expectCode(() => normalize(poisonedMap), "non-index-array-property");
    expect(getterReads).toBe(0);
  });

  test("preserves dangerous property names as ordinary data", () => {
    const source: Record<string, unknown> = {};
    for (const key of ["__proto__", "constructor", "prototype"]) {
      Object.defineProperty(source, key, {
        configurable: true,
        enumerable: true,
        value: key,
        writable: true,
      });
    }

    const normalized = normalize(source) as Record<string, unknown>;
    expect(Object.getPrototypeOf(normalized)).toBeNull();
    expect(Object.keys(normalized)).toEqual(["__proto__", "constructor", "prototype"]);
    expect(normalized.__proto__).toBe("__proto__");
  });

  test("accepts null-prototype records and detaches repeated aliases", () => {
    const child = { value: true };
    const source = Object.assign(Object.create(null) as Record<string, unknown>, {
      left: child,
      right: child,
    });
    const normalized = normalize(source) as {
      left: { value: boolean };
      right: { value: boolean };
    };

    expect(normalized.left).toEqual(normalized.right);
    expect(normalized.left).not.toBe(normalized.right);
  });

  test("converts reflection failures into a stable code without native text", () => {
    const nativeMessage = "native trap detail must not escape";
    const hostile = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error(nativeMessage);
        },
      },
    );

    try {
      normalize(hostile);
      throw new Error("Expected strict-json rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(StrictJsonError);
      expect((error as StrictJsonError).code).toBe("inspection-failed");
      expect((error as Error).message).not.toContain(nativeMessage);
    }
  });
});

describe("JSON records", () => {
  test("recognises descriptor-safe records and exact keys", () => {
    const record = Object.assign(Object.create(null) as Record<string, JsonValue>, {
      required: true,
      optional: null,
    });
    expect(isRecord(record)).toBe(true);
    expect(hasExactKeys(record, ["required"], ["optional"])).toBe(true);
    expect(hasExactKeys(record, ["missing"], ["optional"])).toBe(false);
  });

  test("rejects accessors and throwing proxies without invoking getters", () => {
    let getterReads = 0;
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return true;
      },
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();

    expect(isRecord(accessor)).toBe(false);
    expect(isRecord(revoked.proxy)).toBe(false);
    expect(isRecord({ value: undefined })).toBe(false);
    expect(getterReads).toBe(0);
  });
});
