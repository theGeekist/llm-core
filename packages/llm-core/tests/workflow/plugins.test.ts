import { describe, expect, it } from "bun:test";
import { getEffectivePlugins } from "../../src/workflow/plugins/effective";

describe("Workflow plugin resolution", () => {
  it("keeps only effective plugins after overrides", () => {
    const effective = getEffectivePlugins([
      { key: "alpha", helperKinds: ["one"] },
      { key: "alpha.override", mode: "override", overrideKey: "alpha", helperKinds: ["two"] },
      { key: "alpha", helperKinds: ["three"] },
    ]);

    expect(effective.map((plugin) => plugin.key)).toEqual(["alpha.override"]);
    expect(effective[0]?.helperKinds).toEqual(["two"]);
  });
});
