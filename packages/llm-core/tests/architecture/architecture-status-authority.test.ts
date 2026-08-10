import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checkFixture,
  createArchitectureFixture,
  initialiseGit,
  mutateTask,
  taskDocument,
  type FixtureTask,
} from "./architecture-status-fixture";

const errorsFor = async (
  mutate: (fixture: Awaited<ReturnType<typeof createArchitectureFixture>>) => Promise<void>,
  tasks: readonly FixtureTask[] = [{ id: "alpha-task" }],
): Promise<readonly string[]> => {
  const fixture = await createArchitectureFixture(tasks);
  await mutate(fixture);
  return (await checkFixture(fixture)).errors;
};

const expectError = (errors: readonly string[], message: string): void => {
  expect(errors.some((error) => error.includes(message))).toBe(true);
};

describe("architecture task authority validation", () => {
  test.each([
    ["id: alpha-task", "id: Alpha_Task", "invalid task id"],
    ["id: alpha-task", "id: different-task", "id must match filename"],
    ["stage: architecture", "stage: delivery", "invalid stage"],
    ["status: proposed", "status: parked", "invalid status"],
    ["priority: high", "priority: urgent", "invalid priority"],
    ["preferred_owner_kind: codex", "preferred_owner_kind: robot", "invalid preferred_owner_kind"],
  ])("rejects invalid vocabulary: %s", async (from, to, diagnostic) => {
    const errors = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) => content.replace(from, to)),
    );
    expectError(errors, diagnostic);
  });

  test.each([
    [/^owner_kind:$/m, "owner_kind: 42"],
    [/^owner_kind:$/m, "owner_kind: { invalid: value }"],
  ])("rejects malformed present owner kinds: %s", async (from, to) => {
    const errors = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) => content.replace(from, to)),
    );
    expectError(errors, "invalid owner_kind");
  });

  test.each([
    [/write_scope:.*\nrequired_reading:/s, "required_reading:"],
    [/write_scope:.*\nrequired_reading:/s, "write_scope: []\nrequired_reading:"],
    [/write_scope:.*\nrequired_reading:/s, 'write_scope:\n  - ""\nrequired_reading:'],
  ])("rejects missing, empty and blank write scopes", async (from, to) => {
    const errors = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) => content.replace(from, to)),
    );
    expectError(errors, "non-empty write scope");
  });

  test("rejects a missing dependency", async () => {
    const errors = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) =>
        content.replace("depends_on: []", "depends_on:\n  - missing-task"),
      ),
    );
    expectError(errors, "missing dependency missing-task");
  });

  test("rejects self dependencies and self conflicts", async () => {
    const errors = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) =>
        content
          .replace("depends_on: []", "depends_on:\n  - alpha-task")
          .replace("conflicts_with: []", "conflicts_with:\n  - alpha-task"),
      ),
    );
    expectError(errors, "self dependency");
    expectError(errors, "self conflict");
  });

  test("rejects dependency cycles", async () => {
    const errors = await errorsFor(
      async () => undefined,
      [
        { dependencies: ["beta-task"], id: "alpha-task" },
        { dependencies: ["alpha-task"], id: "beta-task" },
      ],
    );
    expectError(errors, "dependency cycle");
  });

  test("permits proposed tasks waiting on proposed dependencies", async () => {
    const fixture = await createArchitectureFixture([
      { dependencies: ["beta-task"], id: "alpha-task" },
      { id: "beta-task" },
    ]);
    expect((await checkFixture(fixture)).errors).toEqual([]);
  });

  test("permits symmetric conflicts between inactive tasks", async () => {
    const fixture = await createArchitectureFixture([
      { conflicts: ["beta-task"], id: "alpha-task" },
      { conflicts: ["alpha-task"], id: "beta-task" },
    ]);
    expect((await checkFixture(fixture)).errors).toEqual([]);
  });

  test("permits candidates deferred by priority", async () => {
    const fixture = await createArchitectureFixture([{ id: "alpha-task" }, { id: "beta-task" }]);
    await mutateTask(fixture, "beta-task", (content) =>
      content.replace("priority: high", "priority: normal"),
    );
    expect((await checkFixture(fixture)).errors).toEqual([]);
  });

  test("rejects unknown and asymmetric conflicts", async () => {
    const unknown = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) =>
        content.replace("conflicts_with: []", "conflicts_with:\n  - missing-task"),
      ),
    );
    expectError(unknown, "unknown conflict missing-task");
    const asymmetric = await errorsFor(
      async () => undefined,
      [{ conflicts: ["beta-task"], id: "alpha-task" }, { id: "beta-task" }],
    );
    expectError(asymmetric, "asymmetric conflict alpha-task -> beta-task");
  });

  test("rejects missing and unaccepted ADR dependencies", async () => {
    const missing = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) => content.replace("ADR-001", "ADR-999")),
    );
    expectError(missing, "missing decision ADR-999");
    const unaccepted = await errorsFor(async (fixture) => {
      await writeFile(
        join(
          fixture.root,
          "packages/llm-core/docs/final-architecture/decisions/ADR-001-fixture.md",
        ),
        "# ADR-001\n\nStatus: proposed\n",
        "utf8",
      );
    });
    expectError(unaccepted, "not accepted");
  });

  test("validates local replacement existence and qualification", async () => {
    const valid = await createArchitectureFixture([
      { id: "alpha-task", metadata: "replaced_by:\n  - beta-task\n" },
      { id: "beta-task" },
    ]);
    expect((await checkFixture(valid)).errors).toEqual([]);
    const missing = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) =>
        content.replace("required_reading:", "replaced_by:\n  - missing-task\nrequired_reading:"),
      ),
    );
    expectError(missing, "unknown local replacement missing-task");
  });

  test("validates committed package-qualified replacements", async () => {
    const fixture = await createArchitectureFixture();
    const authority = join(fixture.root, "packages/aifsd/docs/final-architecture");
    await mkdir(join(authority, "tasks"), { recursive: true });
    await writeFile(
      join(authority, "tasks/replacement-task.md"),
      taskDocument({ id: "replacement-task" }),
      "utf8",
    );
    initialiseGit(join(fixture.root, "packages/aifsd/docs"));
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace(
        "required_reading:",
        "replaced_by:\n  - aifsd/replacement-task\nrequired_reading:",
      ),
    );
    expect(
      (await checkFixture(fixture)).errors.filter((error) => error.includes("replacement")),
    ).toEqual([]);
  });

  test("rejects nonexistent, malformed and uncommitted foreign replacements", async () => {
    const malformed = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) =>
        content.replace("required_reading:", "replaced_by:\n  - aifsd/too/many\nrequired_reading:"),
      ),
    );
    expectError(malformed, "malformed package-qualified replacement");

    const missing = await createArchitectureFixture();
    await mkdir(join(missing.root, "packages/aifsd/docs"), { recursive: true });
    await mutateTask(missing, "alpha-task", (content) =>
      content.replace(
        "required_reading:",
        "replaced_by:\n  - aifsd/missing-task\nrequired_reading:",
      ),
    );
    expectError((await checkFixture(missing)).errors, "nonexistent committed replacement");
    const fixture = await createArchitectureFixture();
    const authority = join(fixture.root, "packages/aifsd/docs/final-architecture/tasks");
    await mkdir(authority, { recursive: true });
    await writeFile(join(authority, "uncommitted-task.md"), "# Planned\n", "utf8");
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace(
        "required_reading:",
        "replaced_by:\n  - aifsd/uncommitted-task\nrequired_reading:",
      ),
    );
    expectError((await checkFixture(fixture)).errors, "replacement is uncommitted");

    const staged = await createArchitectureFixture();
    const repository = join(staged.root, "packages/aifsd/docs");
    await mkdir(join(repository, "final-architecture/tasks"), { recursive: true });
    await writeFile(join(repository, "README.md"), "# Authority\n", "utf8");
    initialiseGit(repository);
    await writeFile(
      join(repository, "final-architecture/tasks/staged-task.md"),
      "# Staged\n",
      "utf8",
    );
    Bun.spawnSync(["git", "add", "."], { cwd: repository });
    await mutateTask(staged, "alpha-task", (content) =>
      content.replace(
        "required_reading:",
        "replaced_by:\n  - aifsd/staged-task\nrequired_reading:",
      ),
    );
    expectError((await checkFixture(staged)).errors, "replacement is uncommitted");
  });

  test("permits foreign replacements when optional private authority is unavailable", async () => {
    const errors = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) =>
        content.replace(
          "required_reading:",
          "replaced_by:\n  - aifsd/replacement-task\nrequired_reading:",
        ),
      ),
    );
    expect(errors.filter((error) => error.includes("replacement"))).toEqual([]);
  });

  test("keeps forward targets distinct and mutually exclusive", async () => {
    const valid = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) =>
        content.replace(
          "required_reading:",
          "forward_to:\n  - aifsd/planned-task\nrequired_reading:",
        ),
      ),
    );
    expect(valid.filter((error) => error.includes("forward_to"))).toEqual([]);
    const malformed = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) =>
        content.replace("required_reading:", "forward_to:\n  - planned-task\nrequired_reading:"),
      ),
    );
    expectError(malformed, "malformed forward_to target");
    for (const target of ["llm-core/planned-task", "unknown-package/planned-task"]) {
      const invalidAuthority = await errorsFor((fixture) =>
        mutateTask(fixture, "alpha-task", (content) =>
          content.replace("required_reading:", `forward_to:\n  - ${target}\nrequired_reading:`),
        ),
      );
      expectError(invalidAuthority, "malformed forward_to target");
    }
    const conflicting = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) =>
        content.replace(
          "required_reading:",
          "replaced_by:\n  - alpha-task\nforward_to:\n  - aifsd/planned-task\nrequired_reading:",
        ),
      ),
    );
    expectError(conflicting, "mutually exclusive");
  });

  test("rejects projection metadata containing Markdown table delimiters", async () => {
    const errors = await errorsFor((fixture) =>
      mutateTask(fixture, "alpha-task", (content) =>
        content.replace(
          "updated_at: 2026-08-10",
          "evidence_milestone: left | right\nupdated_at: 2026-08-10",
        ),
      ),
    );
    expectError(errors, "evidence_milestone must be Markdown-table safe");
  });
});
