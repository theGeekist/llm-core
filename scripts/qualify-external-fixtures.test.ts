import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverExternalFixtures,
  qualifyExternalFixtures,
  type CommandRunner,
} from "./qualify-external-fixtures";

const roots: string[] = [];

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "llm-core-fixtures-"));
  roots.push(root);
  return root;
};

const makeFixture = (
  root: string,
  path: string,
  options: { lockfile?: boolean; qualify?: string } = {},
): string => {
  const directory = join(root, path, "external-consumer");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({
      name: "fixture",
      private: true,
      scripts:
        options.qualify === undefined ? { qualify: "bun test" } : { qualify: options.qualify },
    }),
  );
  if (options.lockfile !== false) writeFileSync(join(directory, "bun.lock"), "lock");
  return directory;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("external fixture discovery", () => {
  test("accepts an empty repository", () => {
    expect(discoverExternalFixtures(makeRoot())).toEqual([]);
  });

  test("discovers task-owned fixtures deterministically", () => {
    const root = makeRoot();
    makeFixture(root, "packages/z/tests");
    makeFixture(root, "packages/a/tests");
    expect(
      discoverExternalFixtures(root).map(({ relativeDirectory }) => relativeDirectory),
    ).toEqual(["packages/a/tests/external-consumer", "packages/z/tests/external-consumer"]);
  });

  test("fails when a fixture has no independent lockfile", () => {
    const root = makeRoot();
    makeFixture(root, "packages/a/tests", { lockfile: false });
    expect(() => discoverExternalFixtures(root)).toThrow("must own bun.lock or bun.lockb");
  });

  test("fails when a fixture has no runnable qualifier", () => {
    const root = makeRoot();
    makeFixture(root, "packages/a/tests", { qualify: "" });
    expect(() => discoverExternalFixtures(root)).toThrow("must define a non-empty qualify script");
  });
});

describe("external fixture qualification", () => {
  test("runs frozen install and qualification from each fixture", () => {
    const root = makeRoot();
    const directory = makeFixture(root, "packages/a/tests");
    const calls: Array<{ command: readonly string[]; cwd: string }> = [];
    const runner: CommandRunner = (command, cwd) => {
      calls.push({ command, cwd });
      return { exitCode: 0 };
    };
    qualifyExternalFixtures(root, runner);
    expect(calls).toEqual([
      { command: ["bun", "install", "--frozen-lockfile"], cwd: directory },
      { command: ["bun", "run", "qualify"], cwd: directory },
    ]);
  });

  test("fails closed when installation or qualification fails", () => {
    const root = makeRoot();
    makeFixture(root, "packages/a/tests");
    expect(() => qualifyExternalFixtures(root, () => ({ exitCode: 7 }))).toThrow(
      "failed with exit code 7",
    );
  });
});
