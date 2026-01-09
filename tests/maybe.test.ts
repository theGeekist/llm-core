import { describe, expect, it } from "bun:test";
import {
  maybeChain,
  curryK,
  maybeMap,
  maybeMapArray,
  maybeMapOr,
  maybeAll,
  partialK,
  maybeTap,
  maybeToAsyncIterable,
  maybeToStep,
  collectStep,
  toAsyncIterable,
  toStep,
  maybeTry,
  tryWrap,
} from "../src/shared/maybe";
import { bindFirst, toNull } from "../src/shared/fp";

const addOne = (value: number) => value + 1;
const double = (value: number) => value * 2;
const add = (left: number, right: number) => left + right;
const multiply = (left: number, right: number) => left * right;
const join = (prefix: string, ...parts: string[]) => `${prefix}:${parts.join(",")}`;

const tapSeen = (seen: { value: number }, value: number) => {
  seen.value = value;
};

const throwError = () => {
  throw new Error("boom");
};

const recoverWithFallback = () => "fallback";
const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  !!value && typeof (value as PromiseLike<unknown>).then === "function";

describe("Maybe utilities", () => {
  it("maybeMap supports direct and partial application", () => {
    expect(maybeMap(addOne, 2)).toBe(3);
    expect(maybeMap(addOne)(2)).toBe(3);
  });

  it("maybeChain supports direct and partial application", () => {
    expect(maybeChain(double, 3)).toBe(6);
    expect(maybeChain(double)(3)).toBe(6);
  });

  it("bindFirst supports direct and partial application", () => {
    expect(bindFirst(add, 2)(3)).toBe(5);
    expect(bindFirst(add)(2)(3)).toBe(5);
    expect(bindFirst(join, "p")("a", "b")).toBe("p:a,b");
  });

  it("partialK binds the first argument", () => {
    const addTwo = partialK(add, 2);
    expect(addTwo(3)).toBe(5);
    expect(partialK(add)(2)(3)).toBe(5);
  });

  it("curryK supports direct and partial application", () => {
    expect(curryK(multiply, 4, 5)).toBe(20);
    expect(curryK(multiply, 4)(5)).toBe(20);
    expect(curryK(multiply)(4)(5)).toBe(20);
  });

  it("maybeTap preserves the original value", () => {
    const seen = { value: 0 };
    const value = maybeTap(tapSeen.bind(undefined, seen), 7);
    expect(value).toBe(7);
    expect(seen.value).toBe(7);
  });

  it("maybeTap supports partial application", () => {
    const seen = { value: 0 };
    const tap = (value: number) => tapSeen(seen, value);
    const value = maybeTap(tap)(9);
    expect(value).toBe(9);
    expect(seen.value).toBe(9);
  });

  it("maybeAll supports partial application", () => {
    const result = maybeAll<number>()([1, 2, 3]);
    expect(result).toEqual([1, 2, 3]);
  });

  it("maybeAll returns a fresh array for sync values", () => {
    const values = [1, 2, 3];
    const result = maybeAll(values);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(values);
  });

  it("maybeMapArray supports partial application", () => {
    const result = maybeMapArray(addOne)([1, 2]);
    expect(result).toEqual([2, 3]);
  });

  it("maybeMapOr supports fallbacks", async () => {
    const toFallback = () => "none";
    const mapValue = (value: number) => `${value}`;
    const result = maybeMapOr(mapValue, toFallback, undefined);
    expect(await result).toBe("none");
  });

  it("maybeMapOr supports promise inputs", async () => {
    const mapValue = (value: number) => value + 1;
    const result = maybeMapOr(mapValue, toNull, Promise.resolve(4));
    expect(await result).toBe(5);
  });

  it("maybeMapOr supports partial application", () => {
    const mapValue = (value: number) => value + 1;
    const mapped = maybeMapOr(mapValue, toNull);
    expect(mapped(1)).toBe(2);
  });

  it("maybeTry handles errors from thunks", () => {
    const safe = maybeTry(recoverWithFallback, throwError);
    expect(safe).toBe("fallback");
  });

  it("maybeTry supports partial application", () => {
    const safe = maybeTry(recoverWithFallback)(throwError);
    expect(safe).toBe("fallback");
  });

  it("tryWrap returns a safe wrapper", () => {
    const safe = tryWrap(recoverWithFallback, throwError);
    expect(safe()).toBe("fallback");
  });

  it("tryWrap supports partial application", () => {
    const safe = tryWrap(recoverWithFallback)(throwError);
    expect(safe()).toBe("fallback");
  });

  it("toAsyncIterable wraps sync iterables", async () => {
    const iterable = [1, 2, 3];
    const output = toAsyncIterable(iterable);
    const collected: number[] = [];
    for await (const item of output) {
      collected.push(item);
    }
    expect(collected).toEqual([1, 2, 3]);
  });

  it("toAsyncIterable preserves async iterables", async () => {
    const stream = (async function* () {
      yield 4;
      yield 5;
    })();
    const output = toAsyncIterable(stream);
    expect(output).toBe(stream);
    const collected: number[] = [];
    for await (const item of output) {
      collected.push(item);
    }
    expect(collected).toEqual([4, 5]);
  });

  it("toStep preserves sync pull for iterables", () => {
    const step = toStep(["a", "b"]);
    const first = step.next();
    expect(isPromiseLike(first)).toBe(false);
    expect(first).toEqual({ done: false, value: "a" });
  });

  it("toStep preserves async pull for async iterables", async () => {
    const stream = {
      [Symbol.asyncIterator]: async function* () {
        yield "a";
      },
    };
    const step = toStep(stream);
    const first = step.next();
    expect(isPromiseLike(first)).toBe(true);
    const resolved = await first;
    expect(resolved).toEqual({ done: false, value: "a" });
  });

  it("collectStep returns sync arrays for sync steps", () => {
    const step = toStep(["a", "b"]);
    const result = collectStep(step);
    expect(isPromiseLike(result)).toBe(false);
    expect(result).toEqual(["a", "b"]);
  });

  it("collectStep supports async steps and empty streams", async () => {
    const stream = (async function* () { })();
    const step = toStep(stream);
    const result = collectStep(step);
    expect(isPromiseLike(result)).toBe(true);
    expect(await result).toEqual([]);
  });

  it("maybeToStep preserves async iterables", () => {
    const stream = (async function* () {
      yield "x";
    })();
    const step = maybeToStep(stream);
    expect(isPromiseLike(step)).toBe(false);
    if (isPromiseLike(step)) {
      throw new Error("Expected sync step value.");
    }
    expect(isPromiseLike(step.next())).toBe(true);
  });

  it("maybeToAsyncIterable preserves async iterables", async () => {
    const stream = {
      [Symbol.asyncIterator]: async function* () {
        yield "z";
      },
    };
    const output = await maybeToAsyncIterable(stream);
    expect(output).toBe(stream);
    const collected: string[] = [];
    for await (const item of output) {
      collected.push(item);
    }
    expect(collected).toEqual(["z"]);
  });

  it("maybeToAsyncIterable adapts steps to async iterables", async () => {
    const output = await maybeToAsyncIterable(toStep(["a", "b"]));
    const collected: string[] = [];
    for await (const item of output) {
      collected.push(item);
    }
    expect(collected).toEqual(["a", "b"]);
  });
});
