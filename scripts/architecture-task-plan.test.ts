import { describe, expect, test } from "bun:test";
import {
  createArchitectureTaskPlan,
  parseArchitectureTask,
  type ArchitectureDecision,
  type ArchitectureTask,
  type TaskAuthority,
  type TaskPriority,
  type TaskStatus,
} from "./architecture-task-plan";
import { taskPlanConfiguration } from "./architecture-task-plan.config";
import type { RequiredReading } from "./architecture-task-reading";
import { selectPlanAuthorities } from "./plan-architecture-tasks";

interface TaskOptions {
  readonly conflictsWith?: readonly string[];
  readonly decisionDependencies?: readonly string[];
  readonly dependsOn?: readonly string[];
  readonly priority?: TaskPriority | null;
  readonly requiredReading?: readonly RequiredReading[];
  readonly status?: TaskStatus;
  readonly writeScope?: readonly string[];
}

const task = (
  id: string,
  {
    conflictsWith = [],
    decisionDependencies = [],
    dependsOn = [],
    priority = "normal",
    requiredReading = [{ path: "README.md", reason: "Repository context.", ref: null }],
    status = "proposed",
    writeScope = [`src/${id}.ts`],
  }: TaskOptions = {},
  authority: TaskAuthority = "llm-core",
): ArchitectureTask => ({
  authority,
  conflictsWith: conflictsWith.map((item) => (item.includes("/") ? item : `${authority}/${item}`)),
  decisionDependencies,
  declaredPriority: priority,
  dependsOn: dependsOn.map((item) => (item.includes("/") ? item : `${authority}/${item}`)),
  effectivePriority: priority ?? "normal",
  id,
  key: `${authority}/${id}`,
  path: `tasks/${id}.md`,
  readScope: ["README.md"],
  requiredReading,
  status,
  title: id,
  writeScope,
});

const taskDocument = (id: string, extra = ""): string =>
  `---\nid: ${id}\nstatus: proposed\ndepends_on: []\ndecision_dependencies: []\nconflicts_with: []\nwrite_scope:\n  - src/${id}.ts\nread_scope:\n  - README.md\nrequired_reading:\n  - path: README.md\n    reason: Preserve repository context.\n${extra}---\n# ${id}\n`;

const decision = (status: string, path = "decisions/ADR-001-example.md"): ArchitectureDecision => ({
  authority: "llm-core",
  id: "ADR-001",
  path,
  status,
});

describe("architecture task front matter", () => {
  test("uses the configured priority default without inventing a declaration", () => {
    const parsed = parseArchitectureTask({
      authority: "llm-core",
      content: taskDocument("new-task"),
      path: "tasks/new-task.md",
    });
    expect(parsed.declaredPriority).toBeNull();
    expect(parsed.effectivePriority).toBe(taskPlanConfiguration.priority.default);
    const configuration = {
      ...taskPlanConfiguration,
      priority: { ...taskPlanConfiguration.priority, default: "high" as const },
    };
    expect(
      parseArchitectureTask({
        authority: "llm-core",
        configuration,
        content: taskDocument("configured-task"),
        path: "tasks/configured-task.md",
      }).effectivePriority,
    ).toBe("high");
  });

  test("rejects unknown, misspelled and duplicate governance keys", () => {
    for (const [content, message] of [
      [taskDocument("unknown", "mystery: true\n"), "unknown front matter field mystery"],
      [taskDocument("misspelled", "write_scpoe: []\n"), "unknown front matter field write_scpoe"],
      [taskDocument("duplicate", "status: ready\n"), "duplicate front matter field status"],
      [taskDocument("quoted", '"status": ready\n'), "invalid front matter field syntax"],
    ] as const) {
      expect(() =>
        parseArchitectureTask({ authority: "llm-core", content, path: "tasks/invalid.md" }),
      ).toThrow(message);
    }
  });

  test("rejects Bun-accepted indented root mappings before governance can be bypassed", () => {
    const indent = (content: string): string =>
      content
        .split("\n")
        .map((line, index) =>
          index === 0 || line === "---" || line.startsWith("#") ? line : `  ${line}`,
        )
        .join("\n");
    const indentedMisspelling = indent(
      taskDocument("indented-priority").replace("status: proposed", "priorty: critical"),
    );
    const indentedDuplicate = indent(
      taskDocument("indented-id").replace("id: indented-id", "id: first\nid: second"),
    );
    for (const content of [indentedMisspelling, indentedDuplicate]) {
      expect(() =>
        parseArchitectureTask({ authority: "llm-core", content, path: "tasks/indented.md" }),
      ).toThrow(taskPlanConfiguration.messages.errors.indentedFrontMatter);
    }
  });

  test("requires an explicit non-empty string write scope", () => {
    const base = taskDocument("invalid-write");
    const variants = [
      base.replace("write_scope:\n  - src/invalid-write.ts\n", ""),
      base.replace("write_scope:\n  - src/invalid-write.ts", "write_scope: []"),
      base.replace("  - src/invalid-write.ts", "  - 42"),
      base.replace("  - src/invalid-write.ts", '  - ""'),
    ];
    for (const content of variants) {
      expect(() =>
        parseArchitectureTask({ authority: "llm-core", content, path: "tasks/invalid.md" }),
      ).toThrow(taskPlanConfiguration.messages.errors.missingWriteScope);
    }
  });
});

describe("architecture task admission", () => {
  test("short-circuits lower priorities only after dependency and decision gates", async () => {
    const plan = await createArchitectureTaskPlan({
      tasks: [
        task("unfinished", { status: "in_progress" }),
        task("blocked-critical", { dependsOn: ["unfinished"], priority: "critical" }),
        task("high", { priority: "high" }),
        task("normal"),
      ],
    });
    expect(plan.priority).toBe("high");
    expect(plan.candidates.map(({ task: item, canStart }) => [item.id, canStart])).toEqual([
      ["high", true],
      ["normal", false],
    ]);
  });

  test("evaluates same-priority candidates independently against active work", async () => {
    const plan = await createArchitectureTaskPlan({
      tasks: [
        task("active", { status: "in_progress", writeScope: ["packages/owned/**"] }),
        task("overlap", { priority: "critical", writeScope: ["packages/owned/file.ts"] }),
        task("first", { conflictsWith: ["second"], priority: "critical" }),
        task("second", { priority: "critical" }),
      ],
    });
    expect(
      plan.candidates.filter(({ canStart }) => canStart).map(({ task: item }) => item.id),
    ).toEqual(["first", "second"]);
    expect(plan.candidates.find(({ task: item }) => item.id === "overlap")?.safetyBlockers).toEqual(
      ["write scope overlaps active llm-core/active"],
    );
  });

  test("reports active pair conflicts and overlaps and fails candidate admission closed", async () => {
    const plan = await createArchitectureTaskPlan({
      tasks: [
        task("alpha", { status: "in_progress", writeScope: ["src/shared/**"] }),
        task("beta", { status: "review", writeScope: ["src/shared/file.ts"] }),
        task("gamma", { conflictsWith: ["delta"], status: "claimed" }),
        task("delta", { status: "blocked" }),
        task("candidate", { priority: "critical", writeScope: ["src/disjoint.ts"] }),
      ],
    });
    expect(plan.diagnostics).toContain("llm-core/alpha: active write scope overlaps llm-core/beta");
    expect(plan.diagnostics).toContain("llm-core/delta: active conflict with llm-core/gamma");
    expect(plan.active.find(({ task: item }) => item.id === "beta")?.safetyBlockers).toContain(
      "active write scope overlaps llm-core/alpha",
    );
    expect(plan.candidates[0]?.canStart).toBeFalse();
    expect(plan.candidates[0]?.safetyBlockers).toContain(
      "llm-core/delta: active conflict with llm-core/gamma",
    );
  });

  test("keeps ordered and candidate safety evaluations identical", async () => {
    const plan = await createArchitectureTaskPlan({
      dirtyPaths: ["src/dirty.ts"],
      tasks: [task("dirty", { priority: "critical", writeScope: ["src/dirty.ts"] })],
    });
    expect(plan.ordered[0]).toEqual(plan.candidates[0]);
    expect(plan.candidates[0]?.safetyBlockers).toEqual([
      "write scope contains dirty path src/dirty.ts",
    ]);
  });

  test("fails closed for unavailable authorities and retains global safety when filtered", async () => {
    const unavailable = await createArchitectureTaskPlan({
      tasks: [task("candidate", { priority: "critical" })],
      unavailableAuthorities: ["aifsd"],
    });
    expect(unavailable.candidates[0]?.canStart).toBeFalse();
    const global = await createArchitectureTaskPlan({
      tasks: [
        task("active", { status: "in_progress", writeScope: ["owned/**"] }, "aifsd"),
        task("candidate", { priority: "critical", writeScope: ["owned/file.ts"] }),
      ],
    });
    expect(selectPlanAuthorities(global, ["llm-core"]).candidates[0]?.safetyBlockers).toEqual([
      "write scope overlaps active aifsd/active",
    ]);
  });

  test("rejects unknown conflicts except in an unavailable optional authority", async () => {
    await expect(
      createArchitectureTaskPlan({
        tasks: [task("candidate", { conflictsWith: ["aifsd/remote"] })],
      }),
    ).rejects.toThrow("conflicts_with names unknown task llm-core/candidate: aifsd/remote");
    const degraded = await createArchitectureTaskPlan({
      tasks: [task("candidate", { conflictsWith: ["aifsd/remote"] })],
      unavailableAuthorities: ["aifsd"],
    });
    expect(degraded.candidates[0]?.canStart).toBeFalse();
  });

  test("uses configured decision acceptance and rejects duplicate qualified ADR IDs", async () => {
    const governed = task("governed", {
      decisionDependencies: ["ADR-001"],
      priority: "critical",
    });
    const proposed = await createArchitectureTaskPlan({
      decisions: [decision("proposed")],
      tasks: [governed, task("available", { priority: "high" })],
    });
    expect(proposed.priority).toBe("high");
    await expect(
      createArchitectureTaskPlan({
        decisions: [decision("accepted", "accepted.md"), decision("proposed", "proposed.md")],
        tasks: [governed],
      }),
    ).rejects.toThrow("duplicate qualified decision key llm-core/ADR-001");
    const configuration = {
      ...taskPlanConfiguration,
      decisions: { ...taskPlanConfiguration.decisions, acceptedStatus: "ratified" },
    };
    expect(
      (
        await createArchitectureTaskPlan({
          configuration,
          decisions: [decision("ratified")],
          tasks: [governed],
        })
      ).candidates[0]?.canStart,
    ).toBeTrue();
  });

  test("permits only the candidate's own dirty brief", async () => {
    const candidate = task("candidate", {
      priority: "critical",
      writeScope: ["src/candidate.ts", "tasks/candidate.md"],
    });
    const dirtyImplementation = await createArchitectureTaskPlan({
      dirtyPaths: ["src/candidate.ts", "tasks/candidate.md"],
      tasks: [candidate],
    });
    const dirtyBrief = await createArchitectureTaskPlan({
      dirtyPaths: ["tasks/candidate.md"],
      tasks: [candidate],
    });
    expect(dirtyImplementation.candidates[0]?.canStart).toBeFalse();
    expect(dirtyBrief.candidates[0]?.canStart).toBeTrue();
  });
});
