import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalInventory, prepareArtifact } from "./prepare-artifact";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release artifact preparation", () => {
  test("canonicalises inventory independently of npm file order", () => {
    expect(
      canonicalInventory([
        { path: "package/z.js", size: 2 },
        { path: "package/a.js", size: 1 },
      ]),
    ).toBe("package/a.js\u00001\npackage/z.js\u00002\n");
  });

  test("packs once and records exact archive and inventory digests", () => {
    const root = mkdtempSync(join(tmpdir(), "release-artifact-"));
    roots.push(root);
    const packageRoot = join(root, "package");
    const outputRoot = join(root, "output");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, "package.json"),
      `${JSON.stringify({ name: "artifact-fixture", version: "1.2.3", files: ["index.js"] })}\n`,
    );
    writeFileSync(join(packageRoot, "index.js"), "export const answer = 42;\n");

    const metadata = prepareArtifact(packageRoot, outputRoot);

    expect(metadata.package).toBe("artifact-fixture");
    expect(metadata.version).toBe("1.2.3");
    expect(metadata.sha512).toMatch(/^sha512:[0-9a-f]{128}$/);
    expect(metadata.integrity).toStartWith("sha512-");
    expect(metadata.inventory).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(metadata.files.map(({ path }) => path)).toEqual(["index.js", "package.json"]);
  });

  test("spawns the CLI with one local npm-pack fixture and no network", () => {
    const root = mkdtempSync(join(tmpdir(), "release-artifact-cli-"));
    roots.push(root);
    const bin = join(root, "bin");
    const output = join(root, "output");
    const githubOutput = join(root, "github-output");
    const calls = join(root, "npm-calls.log");
    const stub = join(root, "npm-stub.mjs");
    mkdirSync(bin);
    writeFileSync(
      stub,
      [
        'import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";',
        'import { join } from "node:path";',
        "const args = process.argv.slice(2);",
        'appendFileSync(process.env.NPM_CALLS, `${args.join(" ")}\\n`);',
        'const destination = args[args.indexOf("--pack-destination") + 1];',
        "mkdirSync(destination, { recursive: true });",
        'writeFileSync(join(destination, "fixture.tgz"), "exact archive");',
        'process.stdout.write(JSON.stringify([{ filename: "fixture.tgz", id: "fixture@1.2.3", name: "fixture", version: "1.2.3", files: [{ path: "index.js", size: 1 }] }]));',
      ].join("\n"),
    );
    const npm = join(bin, "npm");
    writeFileSync(npm, '#!/bin/sh\nexec "$RELEASE_FIXTURE_NODE" "$NPM_STUB_MODULE" "$@"\n');
    chmodSync(npm, 0o755);
    const result = spawnSync(
      process.execPath,
      [
        join(import.meta.dir, "prepare-artifact.ts"),
        "--package",
        "strict-json",
        "--output",
        output,
        "--github-output",
        githubOutput,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          NPM_CALLS: calls,
          NPM_STUB_MODULE: stub,
          RELEASE_FIXTURE_NODE: process.env.RELEASE_FIXTURE_NODE ?? "node",
        },
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect(result.status).toBe(0);
    expect(readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(1);
    expect(readFileSync(githubOutput, "utf8")).toContain(`tarball=${join(output, "fixture.tgz")}`);
    expect(readFileSync(join(output, "fixture.artifact.json"), "utf8")).toContain(
      '"filename": "fixture.tgz"',
    );
  });
});
