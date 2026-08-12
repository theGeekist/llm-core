import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreateTaskInput } from "../../../shared/task-authoring-contract";
import { createArchitectureTask, renderTaskDocument } from "./task-authoring";

const input = (overrides: Partial<CreateTaskInput> = {}): CreateTaskInput => ({
  authority: "llm-core",
  dependsOn: ["foundation-task", "aifsd/cross-authority-task"],
  id: "reader-created-task",
  objective: "Make architecture documents operational from the workbench.",
  priority: "normal",
  stage: "implementation",
  title: "Reader-created task",
  why: "The task must enter the same governed planner as hand-authored work.",
  ...overrides,
});

describe("task authoring", () => {
  test("renders a planner-valid governed task draft", () => {
    const document = renderTaskDocument(input());
    expect(document).toContain('id: "reader-created-task"');
    expect(document).toContain('status: "proposed"');
    expect(document).toContain('- "foundation-task"');
    expect(document).toContain('- "aifsd/cross-authority-task"');
    expect(document).toContain("# reader-created-task: Reader-created task");
    expect(document).toContain("Make architecture documents operational from the workbench.");
  });

  test("rejects identifiers that cannot enter the task graph", () => {
    expect(() => renderTaskDocument(input({ id: "Not a task ID" }))).toThrow(
      "Task ID must be a kebab-case identifier",
    );
  });

  test("creates the validated task without overwriting an existing task", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "architect-workbench-task-"));
    try {
      const result = await createArchitectureTask(input(), () => ({ valid: true }), workspace);
      const created = await readFile(
        join(workspace, "packages/llm-core/docs/final-architecture/tasks/reader-created-task.md"),
        "utf8",
      );
      expect(result).toEqual({ plan: { valid: true }, taskKey: "llm-core/reader-created-task" });
      expect(created).toContain("# reader-created-task: Reader-created task");
      await expect(
        createArchitectureTask(input(), () => ({ valid: true }), workspace),
      ).rejects.toThrow("A task with this ID already exists");
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });
});
