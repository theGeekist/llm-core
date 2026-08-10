import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkDocumentation } from "../../../../scripts/check-docs";
import {
  checkFixture,
  createArchitectureFixture,
  mutateTask,
  refreshStatus,
} from "./architecture-status-fixture";

const errorContaining = async (
  fixture: Awaited<ReturnType<typeof createArchitectureFixture>>,
  message: string,
): Promise<void> => {
  expect((await checkFixture(fixture)).errors.some((error) => error.includes(message))).toBe(true);
};

describe("architecture STATUS projection", () => {
  test("accepts the canonical exactly-once projection and preserves surrounding prose", async () => {
    const fixture = await createArchitectureFixture();
    const result = await checkFixture(fixture);
    const before = await readFile(fixture.statusPath, "utf8");
    expect(result.errors).toEqual([]);
    expect(await readFile(fixture.statusPath, "utf8")).toStartWith(
      "# Fixture status\n\nProse before.",
    );
    expect(await readFile(fixture.statusPath, "utf8")).toEndWith("\n\nProse after.\n");
    expect(await readFile(fixture.statusPath, "utf8")).toBe(before);
  });

  test("detects omitted task rows", async () => {
    const fixture = await createArchitectureFixture();
    const content = await readFile(fixture.statusPath, "utf8");
    await writeFile(fixture.statusPath, content.replace(/^\| alpha-task \|.*\n/m, ""), "utf8");
    await errorContaining(fixture, "omitted task row alpha-task");
  });

  test("detects unknown and aliased task rows", async () => {
    const fixture = await createArchitectureFixture();
    const content = await readFile(fixture.statusPath, "utf8");
    await writeFile(fixture.statusPath, content.replace("| alpha-task |", "| A-001 |"), "utf8");
    await errorContaining(fixture, "unknown or aliased task row A-001");
    await errorContaining(fixture, "omitted task row alpha-task");
  });

  test("detects duplicate task rows", async () => {
    const fixture = await createArchitectureFixture();
    const content = await readFile(fixture.statusPath, "utf8");
    const row = content.match(/^\| alpha-task \|.*$/m)?.[0];
    expect(row).toBeDefined();
    await writeFile(fixture.statusPath, content.replace(row!, `${row}\n${row}`), "utf8");
    await errorContaining(fixture, "duplicated task row alpha-task");
  });

  test("detects stale lifecycle and dependency cells", async () => {
    const fixture = await createArchitectureFixture([
      { id: "alpha-task" },
      { dependencies: ["alpha-task"], id: "beta-task" },
    ]);
    let content = await readFile(fixture.statusPath, "utf8");
    content = content.replace(
      "| alpha-task | architecture | proposed |",
      "| alpha-task | architecture | ready |",
    );
    content = content.replace(
      "| beta-task | architecture | proposed | alpha-task |",
      "| beta-task | architecture | proposed | A-001 |",
    );
    await writeFile(fixture.statusPath, content, "utf8");
    await errorContaining(fixture, "stale projection for alpha-task");
    await errorContaining(fixture, "stale projection for beta-task");
  });

  test("uses one renderer for lifecycle transitions and rejects task-only edits", async () => {
    const fixture = await createArchitectureFixture();
    for (const status of ["claimed", "in_progress", "review", "blocked", "done"]) {
      await mutateTask(fixture, "alpha-task", (content) => {
        let next = content.replace(/^status: .*$/m, `status: ${status}`);
        if (status === "done") return next;
        next = next
          .replace(/^owner:.*$/m, "owner: fixture-owner")
          .replace(/^owner_kind:.*$/m, "owner_kind: codex")
          .replace(/^lease_started_at:.*$/m, "lease_started_at: 2026-08-10T10:00:00+08:00")
          .replace(/^lease_expires_at:.*$/m, "lease_expires_at: 2026-08-11T10:00:00+08:00")
          .replace(/^base_sha:.*$/m, `base_sha: ${"a".repeat(40)}`)
          .replace(/^branch:.*$/m, "branch: main")
          .replace(/^worktree:.*$/m, `worktree: ${fixture.root}`);
        if (!next.includes("Execution mode:")) {
          next = next.replace(
            "## Work log\n\n",
            "## Work log\n\nExecution mode: shared-checkout\nExecution rationale: Fixture execution.\nConcurrency evaluation: no concurrency; fixture.\nConcurrent task scopes: none\nSwarm delegation: none\n",
          );
        }
        return next;
      });
      await refreshStatus(fixture);
      expect((await checkFixture(fixture)).errors).toEqual([]);
    }
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace("status: done", "status: proposed"),
    );
    await errorContaining(fixture, "stale projection for alpha-task");
  });

  test("runs the read-only check from package release and repository documentation gates", async () => {
    const packageJson = await Bun.file(resolve(import.meta.dir, "../../package.json")).json();
    expect(packageJson.scripts["release:check"]).toStartWith("bun run check:architecture-status");

    const fixture = await createArchitectureFixture();
    await mkdir(join(fixture.root, "docs/.vitepress"), { recursive: true });
    await writeFile(join(fixture.root, "docs/index.md"), "# Fixture docs\n", "utf8");
    await writeFile(
      join(fixture.root, "docs/.vitepress/config.mts"),
      "export default {};\n",
      "utf8",
    );
    await mutateTask(fixture, "alpha-task", (content) =>
      content.replace("status: proposed", "status: ready"),
    );
    expect(
      (await checkDocumentation(fixture.root)).errors.some((error) =>
        error.includes("stale projection for alpha-task"),
      ),
    ).toBe(true);
  });
});
