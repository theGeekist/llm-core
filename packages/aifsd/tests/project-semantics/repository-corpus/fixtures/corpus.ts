import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { coreId, type EventId, type EvidenceId } from "@geekist/llm-core/contracts";
import type { RepositoryCorpusSource } from "../../../../src/project-semantics/adapters/repository-corpus/public.js";

interface FixtureTaskInput {
  readonly conflictsWith?: readonly string[];
  readonly decisionDependencies?: readonly string[];
  readonly dependsOn?: readonly string[];
  readonly id: string;
  readonly owner?: string;
  readonly status: string;
  readonly writeScope: string;
}

const task = ({ id, status, writeScope, ...options }: FixtureTaskInput): string =>
  [
    "---",
    "architecture_version: 1",
    `id: ${id}`,
    `title: ${id} fixture task`,
    `status: ${status}`,
    "priority: critical",
    ...(options.owner === undefined ? [] : [`owner: ${options.owner}`, "owner_kind: coordinator"]),
    ...(options.owner === undefined
      ? []
      : ["lease_started_at: 2026-08-21T00:00:00Z", "lease_expires_at: 2026-08-22T00:00:00Z"]),
    ...(options.dependsOn === undefined
      ? []
      : ["depends_on:", ...options.dependsOn.map((item) => `  - ${item}`)]),
    ...(options.conflictsWith === undefined
      ? []
      : ["conflicts_with:", ...options.conflictsWith.map((item) => `  - ${item}`)]),
    ...(options.decisionDependencies === undefined
      ? []
      : ["decision_dependencies:", ...options.decisionDependencies.map((item) => `  - ${item}`)]),
    "read_scope:",
    "  - architecture/**",
    "required_reading:",
    "  - path: architecture/README.md",
    "    reason: fixture governing authority",
    "write_scope:",
    `  - ${writeScope}`,
    "---",
    "",
    `# ${id}`,
    "ordinary prose must remain evidence only",
  ].join("\n");

export interface CorpusFixture {
  readonly root: string;
  readonly source: RepositoryCorpusSource;
  readonly state: { dirtyPaths: readonly string[] };
  readonly time: { now: string };
  readonly calls: readonly (readonly string[])[];
  readonly dispose: () => Promise<void>;
}

export const createCorpusFixture = async (): Promise<CorpusFixture> => {
  const root = await mkdtemp(join(tmpdir(), "aifsd-repository-corpus-"));
  const architecture = join(root, "architecture");
  const taskRoot = join(architecture, "tasks");
  await mkdir(join(architecture, "decisions"), { recursive: true });
  await mkdir(taskRoot, { recursive: true });
  await writeFile(join(architecture, "README.md"), "# Fixture architecture\n");
  await writeFile(
    join(architecture, "decisions", "ADR-001-fixture.md"),
    ["# ADR-001", "", "Status: accepted"].join("\n"),
  );
  await writeFile(
    join(root, "task-graph.project.json"),
    JSON.stringify({
      schemaVersion: 1,
      taskSchemaVersion: 1,
      id: "fixture-project",
      label: "Repository corpus fixture",
      workspaceRoot: ".",
      authorities: {
        aifsd: {
          architectureRoot: "architecture",
          architectureVersion: 1,
          governingReading: ["architecture/README.md"],
          label: "Fixture authority",
          logicalMount: null,
          optional: false,
          preferredOwnerKind: "coordinator",
          reviewOwner: "fixture-reviewer",
        },
      },
    }),
  );
  await Promise.all([
    writeFile(
      join(architecture, "STATUS.md"),
      [
        "# Fixture status",
        "",
        "## In progress",
        "There are no tasks in progress.",
        "",
        "## Claimed",
        "- [active](tasks/active.md)",
        "",
        "## Review",
        "There are no tasks in review.",
        "",
        "## Done",
        "- [completed](tasks/completed.md)",
        "",
        "## Ready",
        "- [ready](tasks/ready.md)",
        "",
        "## Blocked",
        "- [blocked](tasks/blocked.md)",
        "",
        "## Proposed",
        "- [conflicted](tasks/conflicted.md)",
        "",
        "## Cancelled",
        "There are no cancelled tasks.",
      ].join("\n"),
    ),
    writeFile(
      join(taskRoot, "blocked.md"),
      task({ id: "blocked", status: "blocked", writeScope: "packages/blocked/**" }),
    ),
    writeFile(
      join(taskRoot, "completed.md"),
      task({ id: "completed", status: "done", writeScope: "packages/completed/**" }),
    ),
    writeFile(
      join(taskRoot, "active.md"),
      task({
        id: "active",
        owner: "fixture-coordinator",
        status: "claimed",
        writeScope: "packages/active/**",
      }),
    ),
    writeFile(
      join(taskRoot, "ready.md"),
      task({
        decisionDependencies: ["ADR-001"],
        dependsOn: ["completed"],
        id: "ready",
        status: "ready",
        writeScope: "packages/ready/**",
      }),
    ),
    writeFile(
      join(taskRoot, "conflicted.md"),
      task({
        conflictsWith: ["active"],
        id: "conflicted",
        status: "proposed",
        writeScope: "packages/conflicted/**",
      }),
    ),
  ]);
  for (const command of [
    ["git", "init", "--quiet"],
    ["git", "config", "user.email", "fixture@example.invalid"],
    ["git", "config", "user.name", "Fixture"],
    ["git", "add", "."],
    ["git", "commit", "--quiet", "-m", "fixture"],
  ]) {
    const result = Bun.spawnSync(command, { cwd: root, stderr: "pipe", stdout: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  }
  const calls: (readonly string[])[] = [];
  const state: { dirtyPaths: readonly string[] } = { dirtyPaths: [] };
  const time = { now: "2026-08-21T00:00:00Z" };
  const evidenceId = coreId<EvidenceId>("018f1000-0000-7000-8000-000000000001");
  const source: RepositoryCorpusSource = {
    command: {
      run: async (command) => {
        calls.push(command);
        return { exitCode: 0, stderr: "", stdout: `Task: ${command.at(-1) ?? "unknown"}\n` };
      },
    },
    documents: { readText: (_workspaceRoot, path) => readFile(join(root, path), "utf8") },
    evidenceId,
    git: {
      revision: async () => "0123456789abcdef0123456789abcdef01234567",
      workspaceState: async () => ({ dirtyPaths: state.dirtyPaths, scopeAliases: [] }),
    },
    manifestPath: join(root, "task-graph.project.json"),
    now: () => time.now,
    sourceAuthority: { authorityId: "fixture-repository-corpus", kind: "integration" },
    taskGraphCommand: ["task-graph"],
  };
  return {
    calls,
    dispose: () => rm(root, { force: true, recursive: true }),
    root,
    source,
    state,
    time,
  };
};

export const corpusEventId = (sequence: number): EventId =>
  coreId<EventId>(`018f0000-0000-7000-8000-${sequence.toString().padStart(12, "0")}`);
