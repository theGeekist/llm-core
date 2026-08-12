import { describe, expect, test } from "bun:test";
import type { WorkbenchTask } from "./model";
import { resolutionText } from "./copy";
import { taskResolutions, taskView, taskViewCounts } from "./task-state";

const task = (overrides: Partial<WorkbenchTask> = {}): WorkbenchTask => ({
  authority: "aifsd",
  blockers: [],
  canStart: false,
  conflictsWith: [],
  decisionDependencies: [],
  decisions: [],
  dependsOn: [],
  document: {
    browserUrl: "/api/document?path=tasks%2Fexample.md",
    id: "aifsd/example",
    kind: "task",
    label: "Example",
    obsidianUrl: "obsidian://open?vault=example&file=tasks%2Fexample.md",
    path: "tasks/example.md",
  },
  key: "aifsd/example",
  path: "tasks/example.md",
  priority: "critical",
  priorityDefaulted: false,
  readScope: [],
  requiredReading: [],
  safetyBlockers: [],
  stage: "implementation",
  status: "proposed",
  title: "Example",
  writeScope: [],
  ...overrides,
});

describe("task state", () => {
  test("separates actionable dirty scope from dependency waiting", () => {
    const dirty = task({ blockers: ["write scope contains dirty path package.json"] });
    const dependency = task({ blockers: ["dependency status aifsd/foundation: proposed"] });
    expect(taskView(dirty)).toBe("needs-action");
    expect(taskView(dependency)).toBe("waiting");
    expect(taskResolutions(dirty)[0]?.path).toBe("package.json");
    expect(taskResolutions(dependency)[0]?.relatedTask).toBe("aifsd/foundation");
  });

  test("treats priority deferral as waiting even when a later write scope is dirty", () => {
    expect(
      taskView(
        task({
          blockers: ["write scope contains dirty path bun.lock"],
          safetyBlockers: ["deferred while priority is critical"],
        }),
      ),
    ).toBe("waiting");
    const [resolution] = taskResolutions(
      task({ safetyBlockers: ["deferred while priority is critical"] }),
    );
    expect(resolution).toEqual({ code: "priority-wait", kind: "priority", priority: "critical" });
    const text = resolution === undefined ? null : resolutionText(resolution);
    expect(text).not.toBeNull();
    expect(text === null ? [] : Object.values(text).every((value) => value.trim() !== "")).toBe(
      true,
    );
  });

  test("counts operational views independently of lifecycle vocabulary", () => {
    expect(
      taskViewCounts([
        task({ canStart: true }),
        task({ blockers: ["write scope contains dirty path bun.lock"] }),
        task({ blockers: ["dependency status aifsd/foundation: proposed"] }),
        task({ status: "in_progress" }),
        task({ status: "done" }),
      ]),
    ).toEqual({ active: 1, done: 1, "needs-action": 1, ready: 1, waiting: 1 });
  });
});
