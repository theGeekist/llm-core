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
