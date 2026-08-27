import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkArchitectureStatus } from "../../scripts/check-architecture-status";

export interface FixtureTask {
  readonly conflicts?: readonly string[];
  readonly decisions?: readonly string[];
  readonly dependencies?: readonly string[];
  readonly id: string;
  readonly metadata?: string;
  readonly reading?: string;
  readonly stage?: string;
  readonly status?: string;
  readonly workLog?: string;
  readonly writeScope?: readonly string[];
}

const yamlList = (values: readonly string[]): string => {
  const entries = values.map((value) => `  - ${value}`).join("\n");
  return values.length === 0 ? "[]" : `\n${entries}`;
};

export const taskDocument = ({
  conflicts = [],
  decisions = ["ADR-001"],
  dependencies = [],
  id,
  metadata = "",
  reading,
  stage = "architecture",
  status = "proposed",
  workLog = "",
  writeScope = [`fixtures/${id}/**`],
}: FixtureTask): string => `---
id: ${id}
title: ${id}
stage: ${stage}
status: ${status}
priority: high
depends_on: ${yamlList(dependencies)}
decision_dependencies: ${yamlList(decisions)}
conflicts_with: ${yamlList(conflicts)}
write_scope: ${yamlList(writeScope)}
required_reading:
${reading ?? "  - path: packages/llm-core/docs/final-architecture/README.md\n    reason: Fixture authority."}
read_scope:
  - packages/llm-core/docs/final-architecture/README.md
review_owner: coordinator
updated_at: 2026-08-10
${metadata}---

# ${id}

## Work log

${workLog}
`;

export interface ArchitectureFixture {
  readonly root: string;
  readonly statusPath: string;
  readonly tasksRoot: string;
}

export const createArchitectureFixture = async (
  tasks: readonly FixtureTask[] = [{ id: "alpha-task" }],
): Promise<ArchitectureFixture> => {
  const root = await mkdtemp(join(tmpdir(), "architecture-status-"));
  const architectureRoot = join(root, "packages/llm-core/docs/final-architecture");
  const tasksRoot = join(architectureRoot, "tasks");
  const decisionsRoot = join(architectureRoot, "decisions");
  await mkdir(tasksRoot, { recursive: true });
  await mkdir(decisionsRoot, { recursive: true });
  await writeFile(join(architectureRoot, "README.md"), "# Fixture architecture\n", "utf8");
  await writeFile(
    join(decisionsRoot, "ADR-001-fixture.md"),
    "# ADR-001\n\nStatus: accepted\n",
    "utf8",
  );
  for (const task of tasks) {
    await writeFile(join(tasksRoot, `${task.id}.md`), taskDocument(task), "utf8");
  }
  const statusPath = join(architectureRoot, "STATUS.md");
  await writeFile(
    statusPath,
    "# Fixture status\n\nProse before.\n\n<!-- architecture-status:generated:start -->\n<!-- architecture-status:generated:end -->\n\nProse after.\n",
    "utf8",
  );
  await refreshStatus({ root, statusPath, tasksRoot });
  return { root, statusPath, tasksRoot };
};

export const refreshStatus = async (fixture: ArchitectureFixture): Promise<void> => {
  const result = await checkArchitectureStatus({
    inspectCheckouts: false,
    now: new Date("2026-08-10T12:00:00+08:00"),
    workspaceRoot: fixture.root,
  });
  await writeFile(fixture.statusPath, result.expectedDocument, "utf8");
};

export const checkFixture = async (fixture: ArchitectureFixture) =>
  checkArchitectureStatus({
    inspectCheckouts: false,
    now: new Date("2026-08-10T12:00:00+08:00"),
    workspaceRoot: fixture.root,
  });

export const mutateTask = async (
  fixture: ArchitectureFixture,
  id: string,
  mutate: (content: string) => string,
): Promise<void> => {
  const path = join(fixture.tasksRoot, `${id}.md`);
  await writeFile(path, mutate(await readFile(path, "utf8")), "utf8");
};

export const initialiseGit = (root: string): string => {
  for (const arguments_ of [
    ["init", "-q"],
    ["config", "user.email", "fixture@example.invalid"],
    ["config", "user.name", "Fixture"],
    ["add", "."],
    ["commit", "-qm", "fixture"],
  ]) {
    const result = Bun.spawnSync(["git", ...arguments_], { cwd: root, stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  }
  return Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root }).stdout.toString().trim();
};

export const mountSimpleChatReading = async (fixture: ArchitectureFixture): Promise<string> => {
  const repository = await mkdtemp(join(tmpdir(), "architecture-reading-"));
  await writeFile(join(repository, "reference.md"), "# Aliased reading\n", "utf8");
  await mkdir(join(fixture.root, "context"), { recursive: true });
  await symlink(repository, join(fixture.root, "context/simple-chat"));
  return repository;
};
