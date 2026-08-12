import { describe, expect, test } from "bun:test";
import { detachedTaskCount } from "./graph-topology";

describe("detachedTaskCount", () => {
  test("counts tasks without an in-scope dependency edge", () => {
    expect(
      detachedTaskCount([
        { dependsOn: [], key: "a/root" },
        { dependsOn: ["a/root"], key: "a/child" },
        { dependsOn: [], key: "a/cancelled" },
        { dependsOn: ["missing/task"], key: "a/missing-reference" },
      ]),
    ).toBe(2);
  });
});
