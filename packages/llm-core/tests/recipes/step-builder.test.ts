import { describe, expect, it } from "bun:test";
import { createStep } from "../../src/recipes/step-builder";

describe("Recipe step builder", () => {
  it("builds a step spec with chained configuration", () => {
    const apply = () => null;
    const spec = createStep("alpha", apply)
      .dependsOn("beta")
      .priority(2)
      .override()
      .label("Alpha")
      .kind("demo")
      .summary("demo summary")
      .rollback(() => true)
      .getSpec();

    expect(spec.name).toBe("alpha");
    expect(spec.dependsOn).toEqual(["beta"]);
    expect(spec.priority).toBe(2);
    expect(spec.mode).toBe("override");
    expect(spec.label).toBe("Alpha");
    expect(spec.kind).toBe("demo");
    expect(spec.summary).toBe("demo summary");
    expect(typeof spec.rollback).toBe("function");
  });

  it("appends dependency arrays and preserves extend mode", () => {
    const apply = () => null;
    const spec = createStep("alpha", apply).dependsOn(["a", "b"]).extend().getSpec();

    expect(spec.dependsOn).toEqual(["a", "b"]);
    expect(spec.mode).toBe("extend");
  });
});
