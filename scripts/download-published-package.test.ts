import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import fc from "fast-check";
import { registryIntegrity, verifyPublishedArchive } from "./download-published-package";

const fixtureRoots: string[] = [];
const releaseFixtureNode = process.env.RELEASE_FIXTURE_NODE ?? "node";

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const writeManifest = (
  root: string,
  path: string,
  manifest: Readonly<Record<string, unknown>>,
): void => {
  const output = join(root, path, "package.json");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(manifest)}\n`);
};

const acceptsExactIntegrity = (archive: Uint8Array): void => {
  verifyPublishedArchive(archive, registryIntegrity(archive), "@aifsd/example@1.0.0");
};

const rejectsChangedIntegrity = (archive: Uint8Array): void => {
  const changed = Uint8Array.from(archive);
  changed[0] = (changed[0] ?? 0) ^ 0xff;
  expect(() =>
    verifyPublishedArchive(changed, registryIntegrity(archive), "@aifsd/example@1.0.0"),
  ).toThrow("do not match registry integrity");
};

describe("published package archive verification", () => {
  test("runs the workflow CLI against Node 24 registry and filesystem fixtures", () => {
    const root = mkdtempSync(join(tmpdir(), "download-published-cli-"));
    fixtureRoots.push(root);
    const repositoryRoot = resolve(import.meta.dir, "..");
    mkdirSync(join(root, "scripts/release-history"), { recursive: true });
    copyFileSync(
      join(repositoryRoot, "scripts/download-published-package.ts"),
      join(root, "scripts/download-published-package.ts"),
    );
    copyFileSync(
      join(repositoryRoot, "scripts/release-history/bounded-response.ts"),
      join(root, "scripts/release-history/bounded-response.ts"),
    );
    writeManifest(root, "packages/strict-json", {
      name: "@aifsd/strict-json",
      version: "0.1.0",
    });
    writeManifest(root, "packages/llm-core", {
      dependencies: { "@aifsd/strict-json": "0.1.0" },
      name: "@geekist/llm-core",
      version: "2.0.0",
    });
    writeManifest(root, "packages/aifsd", {
      dependencies: {
        "@aifsd/strict-json": "0.1.0",
        "@geekist/llm-core": "2.0.0",
        "@wpkernel/pipeline": "2.0.0",
      },
      name: "@aifsd/sdk",
      version: "0.1.0",
    });

    const archive = Buffer.from("controlled published package bytes");
    const bin = join(root, "fixture-bin");
    mkdirSync(bin, { recursive: true });
    const npm = join(bin, "npm");
    const npmFixture = join(root, "npm-fixture.mjs");
    writeFileSync(
      npmFixture,
      'import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.TEST_NPM_LOG, process.argv.slice(2).join(" ") + "\\n");\nconsole.log(process.env.TEST_REGISTRY_METADATA);\n',
    );
    writeFileSync(
      npm,
      '#!/bin/sh\nset -eu\nexec "$RELEASE_FIXTURE_NODE" "$TEST_NPM_FIXTURE" "$@"\n',
    );
    chmodSync(npm, 0o755);
    const npmLog = join(root, "npm.log");
    const preload = join(root, "fetch-preload.ts");
    writeFileSync(
      preload,
      `globalThis.fetch = async (_url, init) => {\n  if (!(init?.signal instanceof AbortSignal)) throw new Error("missing bounded signal");\n  return new Response(Buffer.from(process.env.TEST_ARCHIVE_BASE64!, "base64"), { status: Number(process.env.TEST_HTTP_STATUS ?? "200") });\n};\n`,
    );
    const output = join(root, "downloads/llm-core.tgz");
    const githubOutput = join(root, "github-output.txt");
    writeFileSync(githubOutput, "existing=value\n");
    const published = {
      version: "2.0.0",
      gitHead: "a".repeat(40),
      dist: {
        integrity: registryIntegrity(archive),
        tarball: "https://registry.npmjs.org/@geekist/llm-core/-/llm-core-2.0.0.tgz",
      },
    };
    const result = spawnSync(
      process.execPath,
      [
        "--preload",
        preload,
        join(root, "scripts/download-published-package.ts"),
        "--package",
        "llm-core",
        "--output",
        output,
        "--github-output",
        githubOutput,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          RELEASE_FIXTURE_NODE: releaseFixtureNode,
          TEST_ARCHIVE_BASE64: archive.toString("base64"),
          TEST_NPM_LOG: npmLog,
          TEST_NPM_FIXTURE: npmFixture,
          TEST_REGISTRY_METADATA: JSON.stringify(published),
        },
        timeout: 30_000,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Downloaded @geekist/llm-core@2.0.0");
    expect(readFileSync(output)).toEqual(archive);
    expect(readFileSync(npmLog, "utf8")).toContain(
      "view @geekist/llm-core@2.0.0 version dist gitHead --json",
    );
    expect(readFileSync(githubOutput, "utf8")).toBe(
      `existing=value\ntarball=${output}\nintegrity=${published.dist.integrity}\ngit_head=${published.gitHead}\n`,
    );
    expect(createHash("sha512").update(readFileSync(output)).digest("hex")).toBe(
      createHash("sha512").update(archive).digest("hex"),
    );
    expect(
      spawnSync(releaseFixtureNode, ["--version"], { encoding: "utf8" }).stdout.trim(),
    ).toMatch(/^v24\./);

    const malformedNpm = spawnSync(
      process.execPath,
      [
        "--preload",
        preload,
        join(root, "scripts/download-published-package.ts"),
        "--package",
        "llm-core",
        "--output",
        join(root, "malformed.tgz"),
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          RELEASE_FIXTURE_NODE: releaseFixtureNode,
          TEST_ARCHIVE_BASE64: archive.toString("base64"),
          TEST_NPM_FIXTURE: npmFixture,
          TEST_NPM_LOG: npmLog,
          TEST_REGISTRY_METADATA: "not-json",
        },
        timeout: 30_000,
      },
    );
    expect(malformedNpm.status).not.toBe(0);
    expect(malformedNpm.stderr).toContain("JSON");

    const failedHttp = spawnSync(
      process.execPath,
      [
        "--preload",
        preload,
        join(root, "scripts/download-published-package.ts"),
        "--package",
        "llm-core",
        "--output",
        join(root, "failed-http.tgz"),
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          RELEASE_FIXTURE_NODE: releaseFixtureNode,
          TEST_ARCHIVE_BASE64: archive.toString("base64"),
          TEST_HTTP_STATUS: "503",
          TEST_NPM_FIXTURE: npmFixture,
          TEST_NPM_LOG: npmLog,
          TEST_REGISTRY_METADATA: JSON.stringify(published),
        },
        timeout: 30_000,
      },
    );
    expect(failedHttp.status).not.toBe(0);
    expect(failedHttp.stderr).toContain("failed: 503");
  });

  test("accepts every archive only with its exact npm integrity", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 4096 }), acceptsExactIntegrity));
  });

  test("rejects changed bytes under the original integrity", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 4096 }), rejectsChangedIntegrity),
    );
  });
});
