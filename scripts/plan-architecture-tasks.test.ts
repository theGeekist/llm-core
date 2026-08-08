import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  authorityLocations,
  createArchitectureTaskPlan,
  loadAuthority,
  scopesOverlap,
  type ArchitectureTask,
  type ArchitectureTaskPlan,
  type TaskPlanEntry,
} from "./architecture-task-plan";
import {
  taskAuthorities,
  taskPlanConfiguration,
  type TaskPlanConfiguration,
} from "./architecture-task-plan.config";
import { validateTaskReadings } from "./architecture-task-reading";
import {
  parseArguments,
  parseGitDirtyPaths,
  renderContext,
  renderTable,
} from "./plan-architecture-tasks";

const task = (id: string, overrides: Partial<ArchitectureTask> = {}): ArchitectureTask => ({
  authority: "llm-core",
  conflictsWith: [],
  decisionDependencies: [],
  declaredPriority: "normal",
  dependsOn: [],
  effectivePriority: "normal",
  id,
  key: `llm-core/${id}`,
  path: `packages/llm-core/docs/final-architecture/tasks/${id}.md`,
  readScope: ["README.md"],
  requiredReading: [{ path: "README.md", reason: "Repository context.", ref: null }],
  status: "proposed",
  title: id,
  writeScope: [`src/${id}.ts`],
  ...overrides,
});

const entry = (subject: ArchitectureTask): TaskPlanEntry => ({
  blockers: [],
  canStart: true,
  pipelineIndex: 0,
  safetyBlockers: [],
  task: subject,
});

const plan = (subject: ArchitectureTask): ArchitectureTaskPlan => ({
  active: [],
  candidates: [entry(subject)],
  defaultPriority: "normal",
  diagnostics: [],
  ordered: [entry(subject)],
  priority: "normal",
});

const sectionLines = (output: string, title: string, nextTitle: string): readonly string[] => {
  const start = output.indexOf(`${title}:\n`);
  const end = output.indexOf(`\n\n${nextTitle}:`, start);
  if (start < 0 || end < 0) throw new Error(`missing rendered section ${title}`);
  return output
    .slice(start + title.length + 2, end)
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("- ") &&
        line !== `- ${taskPlanConfiguration.messages.context.noneDeclared}`,
    );
};

describe("architecture task planner arguments", () => {
  test("parses authority, format and context selections", () => {
    expect(parseArguments(["--authority", "llm-core", "--format=json"])).toEqual({
      authorities: ["llm-core"],
      context: false,
      format: "json",
      task: null,
    });
    expect(parseArguments(["--context", "aifsd/example"])).toEqual({
      authorities: taskAuthorities,
      context: true,
      format: "table",
      task: "aifsd/example",
    });
  });

  test("rejects ambiguous, duplicate and context-only options", () => {
    for (const arguments_ of [
      ["--unknown"],
      ["--authority"],
      ["--format", "table", "--format", "json"],
      ["--task", "llm-core/example"],
      ["--context", "--format", "json", "llm-core/example"],
      ["--context", "--task", "llm-core/example", "llm-core/other"],
    ]) {
      expect(() => parseArguments(arguments_)).toThrow();
    }
  });

  test("parses NUL-delimited dirty paths including both rename paths", () => {
    expect(parseGitDirtyPaths(" M file.ts\0?? new.ts\0R  moved.ts\0old.ts\0")).toEqual([
      "file.ts",
      "new.ts",
      "moved.ts",
      "old.ts",
    ]);
    expect(() => parseGitDirtyPaths("bad\0")).toThrow(
      taskPlanConfiguration.messages.errors.invalidGitStatusEntry,
    );
  });
});

describe("architecture task planner rendering", () => {
  test("uses configured output copy for candidate admission", () => {
    const configuration: TaskPlanConfiguration = {
      ...taskPlanConfiguration,
      messages: {
        ...taskPlanConfiguration.messages,
        table: { ...taskPlanConfiguration.messages.table, canStart: "selectable" },
      },
    };
    const output = renderTable(plan(task("candidate")), configuration);
    expect(output).toContain("selectable=true");
    expect(output).not.toContain("canStart=true");
  });

  test("renders only selected reading and direct dependency briefs", async () => {
    const dependency = task("dependency", {
      requiredReading: [
        { path: "dependency-secret.md", reason: "Dependency-only evidence.", ref: null },
      ],
    });
    const selected = task("selected", {
      dependsOn: [dependency.key],
      requiredReading: [{ path: "selected-context.md", reason: "Selected evidence.", ref: null }],
    });
    const output = await renderContext(selected, entry(selected), [dependency, selected]);
    expect(output).toContain("- selected-context.md");
    expect(output).toContain(`- ${dependency.path}`);
    expect(output).not.toContain("dependency-secret.md");
  });

  test("keeps every repository task context bounded to its declared obligations", async () => {
    const workspaceRoot = process.cwd();
    const selectedAuthorities = taskAuthorities.filter((authority) => {
      const configured = taskPlanConfiguration.authorities[authority];
      return !configured.optional || existsSync(join(workspaceRoot, configured.architectureRoot));
    });
    const locations = await authorityLocations(
      workspaceRoot,
      selectedAuthorities,
      taskPlanConfiguration,
    );
    const loaded = await Promise.all(
      locations.map((location) => loadAuthority(workspaceRoot, location, taskPlanConfiguration)),
    );
    const tasks = loaded.flatMap(({ tasks: authorityTasks }) => authorityTasks);
    const decisions = loaded.flatMap(({ decisions: authorityDecisions }) => authorityDecisions);
    const unavailableReadingSources = validateTaskReadings({
      scopesOverlap,
      tasks,
      workspaceRoot,
    });
    for (const source of unavailableReadingSources) {
      const configuredRoot =
        taskPlanConfiguration.contextSources.find(({ pathPrefix }) => pathPrefix === source)
          ?.rootFromWorkspace ??
        Object.values(taskPlanConfiguration.authorities).find(
          ({ logicalMount }) => logicalMount === source,
        )?.logicalMount;
      expect(configuredRoot).toBeDefined();
      expect(existsSync(join(workspaceRoot, configuredRoot!))).toBe(false);
    }
    const resolved = await createArchitectureTaskPlan({ decisions, tasks });
    const taskByKey = new Map(tasks.map((item) => [item.key, item]));
    const entryByKey = new Map(resolved.ordered.map((item) => [item.task.key, item]));
    const copy = taskPlanConfiguration.messages.context;
    for (const subject of tasks) {
      const output = await renderContext(subject, entryByKey.get(subject.key)!, tasks);
      expect(
        sectionLines(output, copy.historicalContext, copy.decisionReading),
        subject.key,
      ).toHaveLength(subject.requiredReading.length);
      expect(
        sectionLines(output, copy.dependencyBriefs, copy.additionalReadAuthority),
        subject.key,
      ).toHaveLength(subject.dependsOn.filter((key) => taskByKey.has(key)).length);
      expect(output).not.toContain("Inherited required reading");
    }
  });
});
