import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { enrichArchitecturePlan } from "./features/documents/public";
import { createPlanCache } from "./features/task-plan/public";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const taskKeyPattern = /^[a-z0-9-]+\/[a-z0-9-]+$/;

interface CommandResult {
  readonly stderr: string;
  readonly stdout: string;
}

interface CommandInvocation {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly heading: string;
}

export interface WorkbenchCommand {
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly mutates: boolean;
  readonly requiresTask: boolean;
}

interface CommandSpec extends WorkbenchCommand {
  readonly invocations: (task: string | null) => readonly CommandInvocation[];
}

const run = (command: readonly string[]): CommandResult => {
  const result = Bun.spawnSync([...command], {
    cwd: workspaceRoot,
    stderr: "pipe",
    stdout: "pipe",
  });
  const stderr = result.stderr.toString().trim();
  const stdout = result.stdout.toString().trim();
  if (result.exitCode !== 0) {
    throw new Error(stderr || stdout || `Command failed with exit code ${result.exitCode}`);
  }
  return { stderr, stdout };
};

const privateWorkspaceRoot = run([
  "git",
  "-C",
  resolve(workspaceRoot, "packages/aifsd/docs"),
  "rev-parse",
  "--show-toplevel",
]).stdout;
const git = (...arguments_: string[]): string => run(["git", ...arguments_]).stdout;
const privateRoot = (): string => privateWorkspaceRoot;

const inputStamps = (path: string): readonly string[] => {
  const stat = statSync(path);
  if (!stat.isDirectory()) return [`${path}:${stat.size}:${stat.mtimeMs}`];
  return readdirSync(path, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => inputStamps(join(path, entry.name)));
};

const planInputs = [
  resolve(workspaceRoot, "apps/task-workbench/server/task-data.ts"),
  resolve(workspaceRoot, "apps/task-workbench/server/features/documents/architecture-documents.ts"),
  resolve(workspaceRoot, "scripts/architecture-task-admission.ts"),
  resolve(workspaceRoot, "scripts/architecture-task-frontmatter.ts"),
  resolve(workspaceRoot, "scripts/architecture-task-plan.config.ts"),
  resolve(workspaceRoot, "scripts/architecture-task-plan.ts"),
  resolve(workspaceRoot, "scripts/architecture-task-reading.ts"),
  resolve(workspaceRoot, "scripts/architecture-task-scope.ts"),
  resolve(workspaceRoot, "scripts/plan-architecture-tasks.ts"),
  resolve(workspaceRoot, "packages/llm-core/docs/final-architecture"),
  resolve(workspaceRoot, "packages/aifsd/docs/final-architecture"),
] as const;

const planFingerprint = (): string => {
  const statusArguments = ["status", "--porcelain=v1", "-z", "--untracked-files=all"];
  const inputs = [
    git("rev-parse", "HEAD"),
    git(...statusArguments),
    run(["git", "-C", privateWorkspaceRoot, "rev-parse", "HEAD"]).stdout,
    run(["git", "-C", privateWorkspaceRoot, ...statusArguments]).stdout,
    ...planInputs.flatMap(inputStamps),
  ];
  return createHash("sha256").update(inputs.join("\0")).digest("hex");
};

const cacheIdentity = createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 16);
const planCache = createPlanCache<unknown>(
  join(tmpdir(), "architect-workbench", `${cacheIdentity}-plan.json`),
);

const commandSpecs: readonly CommandSpec[] = [
  {
    description: "Recompute readiness, blockers and candidate admission across all authorities.",
    id: "tasks.plan",
    invocations: () => [
      {
        command: ["bun", "run", "scripts/plan-architecture-tasks.ts", "--authority", "all"],
        cwd: workspaceRoot,
        heading: "Task plan",
      },
    ],
    label: "Plan all tasks",
    mutates: false,
    requiresTask: false,
  },
  {
    description: "Compile the exact governing, historical, decision and dependency reading pack.",
    id: "tasks.context",
    invocations: (task) => [
      {
        command: ["bun", "run", "scripts/plan-architecture-tasks.ts", "--context", task ?? ""],
        cwd: workspaceRoot,
        heading: "Task context",
      },
    ],
    label: "Compile selected task context",
    mutates: false,
    requiresTask: true,
  },
  {
    description:
      "Run the private AIFSD architecture validator, typecheck, tests and formatting gate.",
    id: "architecture.aifsd",
    invocations: () => [
      {
        command: ["bun", "run", "validate:aifsd-architecture"],
        cwd: privateRoot(),
        heading: "AIFSD architecture validation",
      },
    ],
    label: "Validate AIFSD architecture",
    mutates: false,
    requiresTask: false,
  },
  {
    description:
      "Validate published and package documentation, embedded snippets and status projections.",
    id: "architecture.docs",
    invocations: () => [
      {
        command: ["bun", "run", "docs:check"],
        cwd: workspaceRoot,
        heading: "Public documentation checks",
      },
    ],
    label: "Check public docs",
    mutates: false,
    requiresTask: false,
  },
  {
    description: "Check the generated llm-core architecture status projection without writing it.",
    id: "architecture.status",
    invocations: () => [
      {
        command: ["bun", "run", "check:architecture-status"],
        cwd: resolve(workspaceRoot, "packages/llm-core"),
        heading: "Architecture status check",
      },
    ],
    label: "Check architecture status",
    mutates: false,
    requiresTask: false,
  },
  {
    description: "Regenerate the public architecture status projection from task front matter.",
    id: "architecture.status.write",
    invocations: () => [
      {
        command: ["bun", "run", "write:architecture-status"],
        cwd: resolve(workspaceRoot, "packages/llm-core"),
        heading: "Architecture status regeneration",
      },
    ],
    label: "Regenerate architecture status",
    mutates: true,
    requiresTask: false,
  },
  {
    description: "Run the planner argument, rendering and bounded-context regression suite.",
    id: "architecture.planner-tests",
    invocations: () => [
      {
        command: ["bun", "test", "scripts/plan-architecture-tasks.test.ts"],
        cwd: workspaceRoot,
        heading: "Task planner tests",
      },
    ],
    label: "Test task planner",
    mutates: false,
    requiresTask: false,
  },
  {
    description: "Check whitespace errors in both the public and private repository diffs.",
    id: "architecture.diff",
    invocations: () => [
      { command: ["git", "diff", "--check"], cwd: workspaceRoot, heading: "Public diff check" },
      {
        command: ["git", "diff", "--check"],
        cwd: privateRoot(),
        heading: "Private diff check",
      },
    ],
    label: "Check both diffs",
    mutates: false,
    requiresTask: false,
  },
  {
    description:
      "Show the exact modified, deleted, renamed and untracked paths blocking task admission.",
    id: "workspace.status",
    invocations: () => [
      {
        command: ["git", "status", "--short"],
        cwd: workspaceRoot,
        heading: "Current repository changes",
      },
    ],
    label: "Inspect current changes",
    mutates: false,
    requiresTask: false,
  },
] as const;

const runAsync = async ({ command, cwd, heading }: CommandInvocation): Promise<string> => {
  const startedAt = performance.now();
  const child = Bun.spawn([...command], { cwd, stderr: "pipe", stdout: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const duration = ((performance.now() - startedAt) / 1000).toFixed(2);
  return [
    `## ${heading}`,
    `$ ${command.join(" ")}`,
    `exit ${exitCode} · ${duration}s`,
    stdout.trim(),
    stderr.trim(),
  ]
    .filter(Boolean)
    .join("\n");
};

export const workbenchCommands = (): readonly WorkbenchCommand[] =>
  commandSpecs.map(({ description, id, label, mutates, requiresTask }) => ({
    description,
    id,
    label,
    mutates,
    requiresTask,
  }));

export const executeWorkbenchCommand = async (
  id: string,
  task: string | null,
): Promise<{ readonly command: WorkbenchCommand; readonly output: string }> => {
  const spec = commandSpecs.find((candidate) => candidate.id === id);
  if (spec === undefined) throw new Error("Unknown workbench command");
  if (spec.requiresTask && (task === null || !taskKeyPattern.test(task))) {
    throw new Error("This command requires a valid selected task");
  }
  const output: string[] = [];
  for (const invocation of spec.invocations(task)) output.push(await runAsync(invocation));
  return { command: spec, output: output.join("\n\n") };
};

const resolveTaskPlan = (): unknown => {
  const plan = JSON.parse(
    run([
      "bun",
      "run",
      "scripts/plan-architecture-tasks.ts",
      "--authority",
      "all",
      "--format",
      "json",
    ]).stdout,
  ) as Record<string, unknown>;
  return enrichArchitecturePlan({
    ...plan,
    workspace: {
      branch: git("branch", "--show-current"),
      dirty: git("status", "--porcelain").length > 0,
      revision: git("rev-parse", "--short", "HEAD"),
      root: workspaceRoot,
    },
  });
};

export const taskPlan = (): unknown => planCache.resolve(planFingerprint(), resolveTaskPlan);

export const taskContext = (task: string): string => {
  if (!taskKeyPattern.test(task)) throw new Error("Invalid task key");
  return run(["bun", "run", "scripts/plan-architecture-tasks.ts", "--context", task]).stdout;
};

export const rawTask = (task: string): Promise<string> => {
  if (!taskKeyPattern.test(task)) throw new Error("Invalid task key");
  const plan = taskPlan() as { tasks?: Array<{ key: string; path: string }> };
  const path = plan.tasks?.find(({ key }) => key === task)?.path;
  if (path === undefined) throw new Error("Unknown task");
  return Bun.file(resolve(workspaceRoot, path)).text();
};
