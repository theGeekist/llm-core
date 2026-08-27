import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checkFixture,
  createArchitectureFixture,
  mutateTask,
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

const errorsAfterMutatingAlpha = (
  mutate: (content: string) => string,
): Promise<readonly string[]> => errorsFor((fixture) => mutateTask(fixture, "alpha-task", mutate));

describe("architecture task authority validation", () => {
  test.each([
    ["id: alpha-task", "id: Alpha_Task", "id must be a lowercase kebab-case identifier"],
    ["id: alpha-task", "id: different-task", "id must match filename"],
    ["stage: architecture", "stage: delivery", "invalid stage"],
    ["status: proposed", "status: parked", "invalid status"],
    ["priority: high", "priority: urgent", "invalid priority"],
  ])("rejects invalid vocabulary: %s", async (from, to, diagnostic) => {
    const errors = await errorsAfterMutatingAlpha((content) => content.replace(from, to));
    expectError(errors, diagnostic);
  });

  test.each([
    [/write_scope:.*\nrequired_reading:/s, "required_reading:"],
    [/write_scope:.*\nrequired_reading:/s, "write_scope: []\nrequired_reading:"],
    [/write_scope:.*\nrequired_reading:/s, 'write_scope:\n  - ""\nrequired_reading:'],
  ])("rejects missing, empty and blank write scopes", async (from, to) => {
    const errors = await errorsAfterMutatingAlpha((content) => content.replace(from, to));
    expectError(errors, "non-empty write scope");
  });

  test("rejects a missing dependency", async () => {
    const errors = await errorsAfterMutatingAlpha((content) =>
      content.replace("depends_on: []", "depends_on:\n  - missing-task"),
    );
    expectError(errors, "missing dependency missing-task");
  });

  test("rejects self dependencies and self conflicts", async () => {
    const errors = await errorsAfterMutatingAlpha((content) =>
      content
        .replace("depends_on: []", "depends_on:\n  - alpha-task")
        .replace("conflicts_with: []", "conflicts_with:\n  - alpha-task"),
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
    const unknown = await errorsAfterMutatingAlpha((content) =>
      content.replace("conflicts_with: []", "conflicts_with:\n  - missing-task"),
    );
    expectError(unknown, "unknown conflict missing-task");
    const asymmetric = await errorsFor(
      async () => undefined,
      [{ conflicts: ["beta-task"], id: "alpha-task" }, { id: "beta-task" }],
    );
    expectError(asymmetric, "asymmetric conflict alpha-task -> beta-task");
  });

  test("rejects missing and unaccepted ADR dependencies", async () => {
    const missing = await errorsAfterMutatingAlpha((content) =>
      content.replace("ADR-001", "ADR-999"),
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

  test("validates local forward targets", async () => {
    const valid = await createArchitectureFixture([
      { id: "alpha-task", metadata: "forward_to:\n  - beta-task\n" },
      { id: "beta-task" },
    ]);
    expect((await checkFixture(valid)).errors).toEqual([]);
    const missing = await errorsAfterMutatingAlpha((content) =>
      content.replace("required_reading:", "forward_to:\n  - missing-task\nrequired_reading:"),
    );
    expectError(missing, "unknown local forward_to target missing-task");
  });

  test("accepts configured foreign forward targets and rejects malformed targets", async () => {
    const valid = await errorsAfterMutatingAlpha((content) =>
      content.replace(
        "required_reading:",
        "forward_to:\n  - aifsd/planned-task\nrequired_reading:",
      ),
    );
    expect(valid.filter((error) => error.includes("forward_to"))).toEqual([]);
    const malformed = await errorsAfterMutatingAlpha((content) =>
      content.replace("required_reading:", "forward_to:\n  - aifsd/too/many\nrequired_reading:"),
    );
    expectError(malformed, "malformed forward_to target");
  });

  test("rejects self and unconfigured package forward targets", async () => {
    const self = await errorsAfterMutatingAlpha((content) =>
      content.replace("required_reading:", "forward_to:\n  - alpha-task\nrequired_reading:"),
    );
    expectError(self, "task cannot forward to itself");
    for (const target of ["llm-core/planned-task", "unknown-package/planned-task"]) {
      const invalidAuthority = await errorsAfterMutatingAlpha((content) =>
        content.replace("required_reading:", `forward_to:\n  - ${target}\nrequired_reading:`),
      );
      expectError(invalidAuthority, "malformed forward_to target");
    }
  });

  test("rejects projection metadata containing Markdown table delimiters", async () => {
    const errors = await errorsAfterMutatingAlpha((content) =>
      content.replace(
        "updated_at: 2026-08-10",
        "evidence_milestone: left | right\nupdated_at: 2026-08-10",
      ),
    );
    expectError(errors, "evidence_milestone must be Markdown-table safe");
  });
});
