import { describe, expect, test } from "bun:test";
import { parseStatus, runtimeCritical } from "./workspace-remediation";

describe("workspace remediation status", () => {
  test("preserves leading porcelain status columns", () => {
    expect(parseStatus(" M bun.lock\0?? notes.txt\0")).toEqual([
      {
        indexStatus: " ",
        path: "bun.lock",
        runtimeCritical: false,
        worktreeStatus: "M",
      },
      {
        indexStatus: "?",
        path: "notes.txt",
        runtimeCritical: false,
        worktreeStatus: "?",
      },
    ]);
  });

  test("consumes the second path in rename records", () => {
    expect(parseStatus("R  new-name.ts\0old-name.ts\0")).toEqual([
      {
        indexStatus: "R",
        path: "new-name.ts",
        runtimeCritical: false,
        worktreeStatus: " ",
      },
    ]);
  });

  test("identifies source whose removal would terminate the workbench", () => {
    expect(runtimeCritical("apps/task-workbench/vite.config.ts")).toBe(true);
    expect(runtimeCritical("package.json")).toBe(false);
  });
});
