import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateReceiptRetry } from "./reconcile-receipt-asset";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

const receipt = {
  schemaVersion: 1,
  package: "@geekist/llm-core",
  version: "2.0.0",
  tag: "v2.0.0",
  sourceSha: "a".repeat(40),
  releaseSha: "b".repeat(40),
  releaseTree: "c".repeat(40),
  repository: "theGeekist/llm-core",
  workflow: {
    runId: "1",
    attempt: 1,
    repository: "theGeekist/llm-core",
    ref: "refs/tags/v2.0.0",
    sha: "b".repeat(40),
  },
  artifact: {
    sha512: `sha512:${"d".repeat(128)}`,
    inventory: `sha256:${"e".repeat(64)}`,
    filename: "llm-core.tgz",
  },
  npm: {
    integrity: `sha512-${Buffer.alloc(64, 7).toString("base64")}`,
    shasum: "f".repeat(40),
    distTag: "latest",
    tarball: "https://registry.npmjs.org/llm-core.tgz",
    gitHead: "b".repeat(40),
  },
  githubRelease: { url: "https://github.com/theGeekist/llm-core/releases/tag/v2.0.0" },
  attestation: {
    identity: "https://github.com/theGeekist/llm-core/.github/workflows/release.yml",
    url: "https://registry.npmjs.org/attestation",
  },
  verifiedAt: "2026-08-24T00:00:00.000Z",
  result: "verified",
} as const;

describe("receipt asset reconciliation", () => {
  test("accepts an exact immutable receipt on workflow rerun", () => {
    expect(() =>
      validateReceiptRetry(receipt, {
        ...receipt,
        workflow: { ...receipt.workflow, runId: "2", attempt: 2 },
        verifiedAt: "2026-08-24T01:00:00.000Z",
      }),
    ).not.toThrow();
  });

  test("rejects a conflicting existing receipt", () => {
    expect(() =>
      validateReceiptRetry(receipt, {
        ...receipt,
        npm: { ...receipt.npm, shasum: "0".repeat(40) },
      }),
    ).toThrow("conflicts");
  });

  test("spawns the CLI against absent and existing local gh fixtures", () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-asset-cli-"));
    roots.push(root);
    const bin = join(root, "bin");
    mkdirSync(bin);
    const candidate = join(root, "candidate.json");
    const existing = join(root, "existing.json");
    const uploads = join(root, "uploads.log");
    const stub = join(root, "gh-stub.mjs");
    writeFileSync(candidate, JSON.stringify(receipt));
    writeFileSync(existing, JSON.stringify(receipt));
    writeFileSync(
      stub,
      [
        'import { appendFileSync, readFileSync } from "node:fs";',
        "const args = process.argv.slice(2);",
        'if (args[0] === "release") appendFileSync(process.env.UPLOAD_LOG, `${args.join(" ")}\\n`);',
        'else if (args.some((value) => value.endsWith("releases/assets/7"))) process.stdout.write(readFileSync(process.env.EXISTING_RECEIPT));',
        "else process.stdout.write(process.env.RELEASE_JSON);",
      ].join("\n"),
    );
    const gh = join(bin, "gh");
    writeFileSync(gh, '#!/bin/sh\nexec "$RELEASE_FIXTURE_NODE" "$GH_STUB_MODULE" "$@"\n');
    chmodSync(gh, 0o755);
    const run = (releaseJson: string) =>
      spawnSync(
        process.execPath,
        [
          join(import.meta.dir, "reconcile-receipt-asset.ts"),
          "--tag",
          "v2.0.0",
          "--receipt",
          candidate,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GH_STUB_MODULE: stub,
            RELEASE_FIXTURE_NODE: process.env.RELEASE_FIXTURE_NODE ?? "node",
            GITHUB_REPOSITORY: "theGeekist/llm-core",
            EXISTING_RECEIPT: existing,
            RELEASE_JSON: releaseJson,
            UPLOAD_LOG: uploads,
          },
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        },
      );

    expect(run('{"assets":[]}').status).toBe(0);
    expect(readFileSync(uploads, "utf8")).toContain("release upload v2.0.0");
    expect(run('{"assets":[{"id":7,"name":"release-receipt.json"}]}').status).toBe(0);
    expect(readFileSync(uploads, "utf8").trim().split("\n")).toHaveLength(1);
  });
});
