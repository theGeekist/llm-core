import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots = [];
const script = resolve(import.meta.dir, "resolve-release-artifact.mjs");
const nodeBinary = process.env.RELEASE_FIXTURE_NODE ?? "node";

const fixture = (artifact = { schemaVersion: 1, filename: "package.tgz" }) => {
  const root = mkdtempSync(join(tmpdir(), "release-artifact-resolver-"));
  roots.push(root);
  const evidence = join(root, "evidence");
  mkdirSync(evidence);
  writeFileSync(join(evidence, "package.artifact.json"), JSON.stringify(artifact));
  writeFileSync(join(evidence, "package.tgz"), "archive");
  return { root, evidence, output: join(root, "github-output") };
};

const run = ({ evidence, output }) =>
  spawnSync(nodeBinary, [script, "--evidence", evidence, "--github-output", output], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("release artifact resolver CLI", () => {
  test("resolves one realistic metadata and tarball fixture under Node ESM", () => {
    const input = fixture();
    const result = run(input);
    expect(result.status).toBe(0);
    expect(readFileSync(input.output, "utf8")).toBe(
      `metadata=${join(input.evidence, "package.artifact.json")}\ntarball=${join(
        input.evidence,
        "package.tgz",
      )}\n`,
    );
  });

  test("rejects multiple metadata files, traversal and missing archives", () => {
    const multiple = fixture();
    writeFileSync(join(multiple.evidence, "other.artifact.json"), "{}");
    expect(run(multiple).status).not.toBe(0);

    const traversal = fixture({ schemaVersion: 1, filename: "../package.tgz" });
    expect(run(traversal).status).not.toBe(0);

    const missing = fixture({ schemaVersion: 1, filename: "missing.tgz" });
    expect(run(missing).status).not.toBe(0);
  });
});
