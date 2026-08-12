import { realpathSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseTaskFrontMatter } from "../../../../../scripts/architecture-task-frontmatter";
import { taskPlanConfiguration } from "../../../../../scripts/architecture-task-plan.config";
import type { CreateTaskInput, CreateTaskResult } from "../../../shared/task-authoring-contract";

const defaultWorkspaceRoot = resolve(import.meta.dirname, "../../../../..");
const taskIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const priorities = new Set(["critical", "high", "medium", "normal"]);

const taskDirectory = (authority: CreateTaskInput["authority"]): string =>
  `packages/${authority}/docs/final-architecture/tasks`;

const taskPath = (input: CreateTaskInput): string =>
  `${taskDirectory(input.authority)}/${input.id}.md`;

const requiredText = (value: string, field: string, maximum: number): string => {
  const normalised = value.trim();
  if (normalised.length === 0) throw new Error(`${field} is required`);
  if (normalised.length > maximum) throw new Error(`${field} is too long`);
  return normalised;
};

const validatedInput = (input: CreateTaskInput): CreateTaskInput => {
  if (input.authority !== "aifsd" && input.authority !== "llm-core") {
    throw new Error("Unknown task authority");
  }
  if (!taskIdPattern.test(input.id)) throw new Error("Task ID must be a kebab-case identifier");
  if (!taskIdPattern.test(input.stage)) throw new Error("Stage must be a kebab-case identifier");
  if (!priorities.has(input.priority)) throw new Error("Unknown task priority");
  const dependencyPattern = /^(?:aifsd\/|llm-core\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/u;
  if (input.dependsOn.some((dependency) => !dependencyPattern.test(dependency))) {
    throw new Error("Dependencies must be task identifiers or authority/task keys");
  }
  return {
    ...input,
    id: input.id,
    objective: requiredText(input.objective, "Objective", 2_000),
    stage: input.stage,
    title: requiredText(input.title, "Title", 180),
    why: requiredText(input.why, "Reason", 2_000),
  };
};

const authorityDependency = (authority: string, dependency: string): string =>
  dependency.startsWith(`${authority}/`) ? dependency.slice(authority.length + 1) : dependency;

const yamlScalar = (value: string | number | boolean | null): string =>
  value === null ? "null" : typeof value === "string" ? JSON.stringify(value) : String(value);

const yaml = (value: Readonly<Record<string, unknown>>): string =>
  Object.entries(value)
    .flatMap(([key, entry]) => {
      if (!Array.isArray(entry))
        return [`${key}: ${yamlScalar(entry as string | number | boolean | null)}`];
      if (entry.length === 0) return [`${key}: []`];
      return [`${key}:`, ...entry.map((item) => `  - ${yamlScalar(item)}`)];
    })
    .join("\n");

const localDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const renderTaskDocument = (
  candidate: CreateTaskInput,
  workspaceRoot = defaultWorkspaceRoot,
): string => {
  const input = validatedInput(candidate);
  const path = taskPath(input);
  const statusPath = `packages/${input.authority}/docs/final-architecture/STATUS.md`;
  const physicalAifsdRoot =
    input.authority === "aifsd"
      ? realpathSync(resolve(workspaceRoot, "packages/aifsd/docs"))
      : null;
  const writeScope = [path, statusPath];
  if (physicalAifsdRoot !== null) {
    writeScope.push(
      resolve(physicalAifsdRoot, `final-architecture/tasks/${input.id}.md`),
      resolve(physicalAifsdRoot, "final-architecture/STATUS.md"),
    );
  }
  const frontMatter: Record<string, unknown> = {
    architecture_version: input.authority === "aifsd" ? 1 : 2,
    id: input.id,
    title: input.title,
    stage: input.stage,
    status: "proposed",
    priority: input.priority,
  };
  if (input.authority === "llm-core") frontMatter.preferred_owner_kind = "codex";
  Object.assign(frontMatter, {
    owner: null,
    owner_kind: null,
    lease_started_at: null,
    lease_expires_at: null,
    base_sha: null,
    branch: null,
    worktree: null,
    depends_on: input.dependsOn.map((dependency) =>
      authorityDependency(input.authority, dependency),
    ),
    decision_dependencies: [],
    conflicts_with: [],
    required_reading: [],
    write_scope: writeScope,
    read_scope: [path],
    review_owner: input.authority === "aifsd" ? "human" : "coordinator",
    updated_at: localDate(),
  });
  const content = `---\n${yaml(frontMatter)}\n---\n\n# ${input.id}: ${input.title}\n\n## Objective\n\n${input.objective}\n\n## Why this exists\n\n${input.why}\n\n## Inputs\n\n- None recorded yet.\n\n## In scope\n\n- Define the admitted scope before claiming this task.\n\n## Out of scope\n\n- Work not explicitly admitted above.\n\n## Acceptance criteria\n\n- Replace this draft criterion with observable completion evidence.\n\n## Verification\n\n- Record the exact verification commands and receipts.\n\n## Work log\n\nNot started.\n\n## Handoff\n\nPending refinement and claim.\n`;
  parseTaskFrontMatter(content, path, taskPlanConfiguration);
  return content;
};

export const createArchitectureTask = async <Plan>(
  input: CreateTaskInput,
  refreshPlan: () => Plan,
  workspaceRoot = defaultWorkspaceRoot,
): Promise<CreateTaskResult<Plan>> => {
  const content = renderTaskDocument(input, workspaceRoot);
  const relativePath = taskPath(input);
  const absolutePath = resolve(workspaceRoot, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, { encoding: "utf8", flag: "wx" }).catch(
    (error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        throw new Error("A task with this ID already exists");
      }
      throw error;
    },
  );
  try {
    return { plan: refreshPlan(), taskKey: `${input.authority}/${input.id}` };
  } catch (error) {
    await unlink(absolutePath);
    throw error;
  }
};
