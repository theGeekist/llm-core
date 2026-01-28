import { describe, expect, it } from "bun:test";
import { isDefined, readNumber, readString } from "../../src/adapters/utils";
import { isRecord } from "../../src/shared/guards";

describe("adapter utils", () => {
  it("detects record-like values", () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord(null)).toBe(false);
  });

  it("reads string and number values", () => {
    expect(readString("alpha")).toBe("alpha");
    expect(readString(1)).toBeNull();
    expect(readNumber(42)).toBe(42);
    expect(readNumber("42")).toBeNull();
  });

  it("filters undefined values", () => {
    expect(isDefined(0)).toBe(true);
    expect(isDefined(undefined)).toBe(false);
  });
});
