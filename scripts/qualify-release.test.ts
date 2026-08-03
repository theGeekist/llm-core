import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  baselineReleaseCommands,
  qualifyRelease,
  validateQualifierRegistry,
  validateReleaseEntrypoints,
  validateWorkflowPolicy,
  type ReleaseQualifierRegistry,
} from "./qualify-release";
import type { CommandRunner } from "./qualify-external-fixtures";

const roots: string[] = [];

const writeJson = (path: string, value: unknown): void =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "llm-core-release-"));
  roots.push(root);
  mkdirSync(join(root, "packages/llm-core"), { recursive: true });
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, ".bun-version"), "1.3.8\n");
  writeFileSync(join(root, "bun.lock"), "lock\n");
  writeJson(join(root, "package.json"), {
    scripts: { "release:qualify:llm-core": "bun run scripts/qualify-release.ts" },
  });
  writeJson(join(root, "packages/llm-core/package.json"), {
    exports: {},
    scripts: {
      "publish:npm": "bun run --cwd ../.. release:qualify:llm-core && bun publish",
    },
  });
  writeFileSync(
    join(root, ".github/workflows/release.yml"),
    [
      "jobs:",
      "  release-core:",
      "    steps:",
      "      - name: Qualify",
      "        run: bun run release:qualify:llm-core",
      "      - name: Publish",
      "        run: npm publish --access public",
    ].join("\n"),
  );
  for (const path of ["ci.yml", "docs.yml"]) {
    writeFileSync(
      join(root, ".github/workflows", path),
      [
        "steps:",
        "  - uses: oven-sh/setup-bun@v2",
        "    with:",
        '      bun-version-file: ".bun-version"',
        "  - run: bun install --frozen-lockfile",
      ].join("\n"),
    );
  }
  writeFileSync(
    join(root, ".github/workflows/release.yml"),
    `${readFileSync(join(root, ".github/workflows/release.yml"), "utf8")}\n` +
      [
        "  setup:",
        "    steps:",
        "      - uses: oven-sh/setup-bun@v2",
        "        with:",
        '          bun-version-file: ".bun-version"',
      ].join("\n"),
  );
  writeJson(join(root, "scripts/release-qualifiers.json"), {
    version: 1,
    requiredSurfaces: [],
    qualifiers: [],
  });
  return root;
};

const publishConditionalSurface = (root: string, surface: string): void => {
  const path = join(root, "packages/llm-core/package.json");
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  writeJson(path, {
    ...manifest,
    exports: { [surface]: { import: "./dist/conditional.js" } },
  });
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release qualifier registry", () => {
  test("accepts an empty registry before conditional publication", () => {
    expect(
      validateQualifierRegistry({ version: 1, requiredSurfaces: [], qualifiers: [] }, []),
    ).toEqual([]);
  });

  test("rejects an omitted published-surface declaration", () => {
    const registry = { version: 1, qualifiers: [] } as unknown as ReleaseQualifierRegistry;
    expect(validateQualifierRegistry(registry, []).join("\n")).toContain(
      "requiredSurfaces must be an array",
    );
  });

  test("rejects a published surface without its qualifier", () => {
    expect(
      validateQualifierRegistry(
        {
          version: 1,
          requiredSurfaces: ["./client"],
          qualifiers: [],
        },
        ["./client"],
      ).join("\n"),
    ).toContain("required qualifier missing for ./client");
  });

  test("rejects duplicate surfaces", () => {
    const qualifier = {
      surface: "./client",
      supportWindow: "1.x",
      owner: "client-maintainer",
      command: ["bun", "run", "qualify:client"],
    };
    expect(
      validateQualifierRegistry(
        {
          version: 1,
          requiredSurfaces: ["./client"],
          qualifiers: [qualifier, qualifier],
        },
        ["./client"],
      ).join("\n"),
    ).toContain("duplicate qualifier surface");
  });

  test("rejects unknown and skipped qualifier fields", () => {
    const registry = {
      version: 1,
      requiredSurfaces: ["./client"],
      qualifiers: [
        {
          surface: "./client",
          supportWindow: "1.x",
          owner: "client-maintainer",
          command: ["bun", "run", "qualify:client"],
          skip: true,
        },
      ],
      unknown: true,
    } as unknown as ReleaseQualifierRegistry;
    const errors = validateQualifierRegistry(registry, ["./client"]).join("\n");
    expect(errors).toContain("unknown field unknown");
    expect(errors).toContain("unknown field skip");
  });
});

describe("canonical release qualification", () => {
  test("runs every baseline gate and registered qualifier", () => {
    const root = makeRoot();
    publishConditionalSurface(root, "./client");
    writeJson(join(root, "scripts/release-qualifiers.json"), {
      version: 1,
      requiredSurfaces: ["./client"],
      qualifiers: [
        {
          surface: "./client",
          supportWindow: "metro@1",
          owner: "client-maintainer",
          command: ["bun", "run", "qualify:client"],
        },
      ],
    });
    const calls: Array<readonly string[]> = [];
    const runner: CommandRunner = (command) => {
      calls.push([...command]);
      return { exitCode: 0 };
    };
    qualifyRelease(root, runner, "1.3.8");
    expect(calls).toEqual([
      ["bun", "install", "--frozen-lockfile"],
      ["bun", "run", "lint"],
      ["bun", "run", "--cwd", "packages/llm-core", "release:build"],
      ["bun", "run", "test:package"],
      ["bun", "run", "qualify:external-fixtures"],
      ["bun", "run", "docs:check"],
      ["bun", "run", "--cwd", "packages/llm-core", "format:check"],
      ["bun", "run", "check:sloc"],
      ["bun", "run", "qualify:client"],
    ]);
    expect(calls.slice(0, baselineReleaseCommands.length)).toEqual([...baselineReleaseCommands]);
  });

  test("rejects the wrong local Bun version", () => {
    const root = makeRoot();
    expect(() => qualifyRelease(root, () => ({ exitCode: 0 }), "1.2.21")).toThrow(
      "Bun 1.3.8 is required",
    );
  });

  test("fails when a support qualifier fails", () => {
    const root = makeRoot();
    publishConditionalSurface(root, "./client");
    writeJson(join(root, "scripts/release-qualifiers.json"), {
      version: 1,
      requiredSurfaces: ["./client"],
      qualifiers: [
        {
          surface: "./client",
          supportWindow: "metro@1",
          owner: "client-maintainer",
          command: ["bun", "run", "qualify:client"],
        },
      ],
    });
    const runner: CommandRunner = (command) => ({
      exitCode: command.includes("qualify:client") ? 9 : 0,
    });
    expect(() => qualifyRelease(root, runner, "1.3.8")).toThrow("failed with exit code 9");
  });

  test("fails when package or tagged publication bypasses the canonical command", () => {
    const root = makeRoot();
    writeJson(join(root, "packages/llm-core/package.json"), {
      scripts: { "publish:npm": "bun publish" },
    });
    writeFileSync(
      join(root, ".github/workflows/release.yml"),
      "- run: npm publish --access public\n",
    );
    const errors = validateReleaseEntrypoints(root).join("\n");
    expect(errors).toContain("package publish:npm must delegate");
    expect(errors).toContain("tagged npm publication must follow");
  });

  test("requires a root lockfile", () => {
    const root = makeRoot();
    rmSync(join(root, "bun.lock"));
    expect(() => qualifyRelease(root, () => ({ exitCode: 0 }), "1.3.8")).toThrow();
  });

  test("rejects a manifest export omitted from requiredSurfaces", () => {
    const root = makeRoot();
    publishConditionalSurface(root, "./client");
    expect(() => qualifyRelease(root, () => ({ exitCode: 0 }), "1.3.8")).toThrow(
      "published conditional export missing from requiredSurfaces ./client",
    );
  });

  test("rejects workflow version drift and mutable installs", () => {
    const root = makeRoot();
    writeFileSync(
      join(root, ".github/workflows/docs.yml"),
      [
        "steps:",
        "  - uses: oven-sh/setup-bun@v2",
        "    with:",
        '      bun-version: "latest"',
        "  - run: bun install --cwd packages/llm-core",
      ].join("\n"),
    );
    const errors = validateWorkflowPolicy(root).join("\n");
    expect(errors).toContain("source every Bun setup from .bun-version");
    expect(errors).toContain("mutable or package-local Bun install");
  });

  test("rejects mutable installs in multiline workflow steps", () => {
    const root = makeRoot();
    writeFileSync(
      join(root, ".github/workflows/docs.yml"),
      [
        "steps:",
        "  - uses: oven-sh/setup-bun@v2",
        "    with:",
        '      bun-version-file: ".bun-version"',
        "  - run: |",
        "      bun install",
      ].join("\n"),
    );
    expect(validateWorkflowPolicy(root).join("\n")).toContain(
      "mutable or package-local Bun install",
    );
  });

  test("accepts frozen root installs in multiline workflow steps", () => {
    const root = makeRoot();
    writeFileSync(
      join(root, ".github/workflows/docs.yml"),
      [
        "steps:",
        "  - uses: oven-sh/setup-bun@v2",
        "    with:",
        '      bun-version-file: ".bun-version"',
        "  - run: |",
        "      bun install --frozen-lockfile",
      ].join("\n"),
    );
    expect(validateWorkflowPolicy(root)).toEqual([]);
  });

  test("ignores comments and qualification in unrelated workflow jobs", () => {
    const root = makeRoot();
    writeFileSync(
      join(root, ".github/workflows/release.yml"),
      [
        "jobs:",
        "  unrelated:",
        "    steps:",
        "      - run: bun run release:qualify:llm-core",
        "  release-core:",
        "    steps:",
        "      # run: bun run release:qualify:llm-core",
        "      - run: npm publish --access public",
      ].join("\n"),
    );
    expect(validateReleaseEntrypoints(root).join("\n")).toContain(
      "tagged npm publication must follow",
    );
  });

  test("rejects whitespace aliases and malformed qualifier commands", () => {
    const registry = {
      version: 1,
      requiredSurfaces: ["./client"],
      qualifiers: [
        {
          surface: " ./client ",
          supportWindow: "metro@1",
          owner: "client-maintainer",
          command: ["bun", ""],
        },
      ],
    };
    const errors = validateQualifierRegistry(registry, ["./client"]).join("\n");
    expect(errors).toContain("canonical package subpath");
    expect(errors).toContain("command must be a non-empty string array");
  });
});
