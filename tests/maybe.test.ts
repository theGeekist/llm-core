import { describe, expect, it } from "bun:test";
import {
  bindFirst,
  maybeChain,
  curryK,
  maybeMap,
  partialK,
  maybeTap,
  maybeTry,
  tryWrap,
} from "../src/maybe";

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

  it("maybeTry handles errors from thunks", () => {
    const safe = maybeTry(recoverWithFallback, throwError);
    expect(safe).toBe("fallback");
  });

  it("tryWrap returns a safe wrapper", () => {
    const safe = tryWrap(recoverWithFallback, throwError);
    expect(safe()).toBe("fallback");
  });
});
