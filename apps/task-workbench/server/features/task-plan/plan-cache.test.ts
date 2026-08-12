import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlanCache } from "./plan-cache";

describe("task plan cache", () => {
  test("reuses an unchanged plan in memory and across server instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "architect-workbench-plan-cache-"));
    const path = join(directory, "plan.json");
    let resolutions = 0;
    try {
      const first = createPlanCache<{ readonly revision: number }>(path);
      const resolve = () => ({ revision: ++resolutions });
      expect(first.resolve("same-input", resolve)).toEqual({ revision: 1 });
      expect(first.resolve("same-input", resolve)).toEqual({ revision: 1 });
      expect(createPlanCache(path).resolve("same-input", resolve)).toEqual({ revision: 1 });
      expect(first.resolve("changed-input", resolve)).toEqual({ revision: 2 });
      expect(resolutions).toBe(2);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
