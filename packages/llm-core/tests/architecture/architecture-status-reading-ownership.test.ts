import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checkFixture,
  createArchitectureFixture,
  initialiseGit,
  mountSimpleChatReading,
  mutateTask,
  refreshStatus,
} from "./architecture-status-fixture";

const expectError = (errors: readonly string[], message: string): void => {
  expect(errors.some((error) => error.includes(message))).toBe(true);
};

const activate = async (
  fixture: Awaited<ReturnType<typeof createArchitectureFixture>>,
  id: string,
  overrides: Partial<Record<"lease" | "mode" | "concurrency" | "scopes" | "worktree", string>> = {},
): Promise<void> => {
  await mutateTask(fixture, id, (content) =>
    content
      .replace("status: proposed", "status: in_progress")
      .replace(/^owner:.*$/m, "owner: fixture-owner")
      .replace(/^owner_kind:.*$/m, "owner_kind: codex")
      .replace(/^lease_started_at:.*$/m, "lease_started_at: 2026-08-10T10:00:00+08:00")
      .replace(
        /^lease_expires_at:.*$/m,
        `lease_expires_at: ${overrides.lease ?? "2026-08-11T10:00:00+08:00"}`,
      )
      .replace(/^base_sha:.*$/m, `base_sha: ${"a".repeat(40)}`)
      .replace(/^branch:.*$/m, "branch: main")
      .replace(/^worktree:.*$/m, `worktree: ${overrides.worktree ?? fixture.root}`)
      .replace(
        "## Work log\n\n",
        `## Work log\n\nExecution mode: ${overrides.mode ?? "shared-checkout"}\nExecution rationale: Fixture execution.\nConcurrency evaluation: ${overrides.concurrency ?? "no concurrency; fixture"}\nConcurrent task scopes: ${overrides.scopes ?? "none"}\nSwarm delegation: none\n`,
      ),
  );
};

describe("required architecture reading", () => {
  test.each([
    [
      /required_reading:\n {2}- path:.*\n {4}reason:.*\n/,
      "required_reading: []\n",
      "non-empty required reading list",
    ],
    ["reason: Fixture authority.", "reason:", "reason must be a non-empty string"],
    [
      "reason: Fixture authority.",
      "reason: Fixture authority.\n    extra: value",
      "unknown required reading field",
    ],
    [
      "reason: Fixture authority.",
      "reason: Fixture authority.\n    ref: abc",
      "full Git commit id",
    ],
  ])("rejects malformed required reading", async (from, to, diagnostic) => {
    const fixture = await createArchitectureFixture();
    await mutateTask(fixture, "alpha-task", (content) => content.replace(from, to));
    expectError((await checkFixture(fixture)).errors, diagnostic);
  });

  test("rejects duplicate readings", async () => {
    const fixture = await createArchitectureFixture();
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace(
        "required_reading:\n  - path: packages/llm-core/docs/final-architecture/README.md\n    reason: Fixture authority.",
        "required_reading:\n  - path: packages/llm-core/docs/final-architecture/README.md\n    reason: Fixture authority.\n  - path: packages/llm-core/docs/final-architecture/README.md\n    reason: Duplicate.",
      ),
    );
    expectError((await checkFixture(fixture)).errors, "duplicates required reading");
  });

  test("rejects readings outside exact read authority", async () => {
    const fixture = await createArchitectureFixture();
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace(
        "read_scope:\n  - packages/llm-core/docs/final-architecture/README.md",
        "read_scope:\n  - packages/llm-core/docs/final-architecture/**",
      ),
    );
    expectError((await checkFixture(fixture)).errors, "not declared exactly in read_scope");
  });

  test("rejects nonexistent current reading", async () => {
    const fixture = await createArchitectureFixture();
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replaceAll(
        "packages/llm-core/docs/final-architecture/README.md",
        "packages/llm-core/docs/final-architecture/missing.md",
      ),
    );
    expectError((await checkFixture(fixture)).errors, "required reading file does not exist");
  });

  test("accepts configured repository aliases", async () => {
    const fixture = await createArchitectureFixture();
    await mountSimpleChatReading(fixture);
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replaceAll(
        "packages/llm-core/docs/final-architecture/README.md",
        "context/simple-chat/reference.md",
      ),
    );
    await refreshStatus(fixture);
    expect((await checkFixture(fixture)).errors).toEqual([]);
  });

  test("accepts a revision-pinned file and rejects a missing historical file", async () => {
    const fixture = await createArchitectureFixture();
    const revision = initialiseGit(fixture.root);
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace(
        "reason: Fixture authority.",
        `reason: Fixture authority.\n    ref: ${revision}`,
      ),
    );
    await refreshStatus(fixture);
    expect((await checkFixture(fixture)).errors).toEqual([]);

    await writeFile(
      join(fixture.root, "packages/llm-core/docs/final-architecture/later.md"),
      "# Later\n",
      "utf8",
    );
    await mutateTask(fixture, "alpha-task", (content) =>
      content
        .replace(
          "packages/llm-core/docs/final-architecture/README.md",
          "packages/llm-core/docs/final-architecture/later.md",
        )
        .replace(
          "read_scope:\n  - packages/llm-core/docs/final-architecture/README.md",
          "read_scope:\n  - packages/llm-core/docs/final-architecture/later.md",
        ),
    );
    expectError((await checkFixture(fixture)).errors, "revision does not contain file");
  });
});

describe("active ownership and checkout invariants", () => {
  test("accepts complete active ownership metadata", async () => {
    const fixture = await createArchitectureFixture();
    await activate(fixture, "alpha-task");
    await refreshStatus(fixture);
    expect((await checkFixture(fixture)).errors).toEqual([]);
  });

  test("ignores repeated lifecycle labels outside the Work log", async () => {
    const fixture = await createArchitectureFixture();
    await activate(fixture, "alpha-task");
    await mutateTask(
      fixture,
      "alpha-task",
      (content) =>
        `${content}\n## Handoff\n\nExecution mode: shared-checkout\nExecution rationale: Handoff prose.\nConcurrency evaluation: no concurrency; handoff.\nConcurrent task scopes: none\nSwarm delegation: none\n`,
    );
    await refreshStatus(fixture);
    expect((await checkFixture(fixture)).errors).toEqual([]);
  });

  test("accepts documented swarm delegation lineage", async () => {
    const fixture = await createArchitectureFixture();
    await activate(fixture, "alpha-task");
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace(
        "Swarm delegation: none",
        "Swarm delegation: codex-root -> codex/reviewer: independent review; review output",
      ),
    );
    await refreshStatus(fixture);
    expect((await checkFixture(fixture)).errors).toEqual([]);
  });

  test.each([
    "",
    "delegated",
    "parent -> child: review",
    "parent -> child; output",
    "parent ->  : review; output",
    "parent -> child:  ; output",
  ])("rejects malformed swarm delegation %j", async (delegation) => {
    const fixture = await createArchitectureFixture();
    await activate(fixture, "alpha-task");
    await refreshStatus(fixture);
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace("Swarm delegation: none", `Swarm delegation: ${delegation}`),
    );
    expectError((await checkFixture(fixture)).errors, "malformed swarm delegation");
  });

  test("rejects missing ownership and malformed leases", async () => {
    const fixture = await createArchitectureFixture();
    await activate(fixture, "alpha-task", { lease: "2026-08-09T10:00:00+08:00" });
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace("owner: fixture-owner", "owner:"),
    );
    const errors = (await checkFixture(fixture)).errors;
    expectError(errors, "owner must be a non-empty string");
    expectError(errors, "malformed or expired active lease");
  });

  test("rejects execution mode and concurrency evidence mismatches", async () => {
    const fixture = await createArchitectureFixture();
    await activate(fixture, "alpha-task", {
      concurrency: "not evaluated",
      mode: "dedicated-worktree",
    });
    const errors = (await checkFixture(fixture)).errors;
    expectError(errors, "execution mode does not match worktree");
    expectError(errors, "incomplete concurrency evaluation");
  });

  test("rejects overlapping active writers", async () => {
    const fixture = await createArchitectureFixture([
      { id: "alpha-task", writeScope: ["shared/**"] },
      { id: "beta-task", writeScope: ["shared/file.ts"] },
    ]);
    await activate(fixture, "alpha-task");
    await activate(fixture, "beta-task");
    expectError((await checkFixture(fixture)).errors, "active write scope overlaps beta-task");
  });

  test("requires exact peer task IDs in concurrent-scope evidence", async () => {
    const fixture = await createArchitectureFixture([{ id: "alpha-task" }, { id: "beta-task" }]);
    await activate(fixture, "alpha-task", {
      concurrency: "start alongside beta-taskish",
      scopes: "beta-taskish owns a disjoint scope",
    });
    await activate(fixture, "beta-task", {
      concurrency: "start alongside alpha-taskish",
      scopes: "alpha-taskish owns a disjoint scope",
    });
    const errors = (await checkFixture(fixture)).errors;
    expectError(errors, "concurrent-scope evidence omits active task beta-task");
    expectError(errors, "concurrent-scope evidence omits active task alpha-task");
  });

  test("rejects assignment metadata on proposed tasks", async () => {
    const fixture = await createArchitectureFixture();
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace("owner:", "owner: stale-owner"),
    );
    expectError((await checkFixture(fixture)).errors, "proposed task must be unassigned");
  });
});
