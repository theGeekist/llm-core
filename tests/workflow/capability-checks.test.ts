import { describe, expect, it } from "bun:test";
import { isCapabilitySatisfied } from "#workflow/capability-checks";

describe("Workflow capability checks", () => {
  it("treats empty values as missing", () => {
    expect(isCapabilitySatisfied(undefined)).toBe(false);
    expect(isCapabilitySatisfied(null)).toBe(false);
    expect(isCapabilitySatisfied(false)).toBe(false);
    expect(isCapabilitySatisfied([])).toBe(false);
    expect(isCapabilitySatisfied("")).toBe(false);
  });

  it("treats non-empty values as present", () => {
    expect(isCapabilitySatisfied(true)).toBe(true);
    expect(isCapabilitySatisfied(["a"])).toBe(true);
    expect(isCapabilitySatisfied("value")).toBe(true);
    expect(isCapabilitySatisfied({})).toBe(true);
  });
});
