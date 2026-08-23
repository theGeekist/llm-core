import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ArtifactMetadata } from "./prepare-artifact";

const fixtureRoots: string[] = [];
const releaseFixtureNode = process.env.RELEASE_FIXTURE_NODE ?? "node";

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const writeExecutable = (path: string, source: string): void => {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
};

const run = (
  command: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>> = {},
) => {
  const result = spawnSync(command[0]!, command.slice(1), {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  return result;
};

const copyControllerSources = (root: string): string => {
  const repositoryRoot = resolve(import.meta.dir, "../..");
  const paths = [
    "scripts/release-version.ts",
    "scripts/release-provenance.ts",
    "scripts/release-provenance-receipt.ts",
    "scripts/release-history/bounded-response.ts",
    "scripts/release-history/prepare-artifact.ts",
    "scripts/release-history/release-controller.ts",
    "scripts/release-history/release-live-authority.ts",
    "scripts/release-history/verify-provenance-attestation.ts",
  ];
  for (const path of paths) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(repositoryRoot, path), destination);
  }
  return join(root, "scripts/release-history/release-controller.ts");
};

const makeControllerFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "release-controller-cli-"));
  fixtureRoots.push(root);
  const controller = copyControllerSources(root);
  const packageRoot = join(root, "packages/llm-core");
  const bin = join(root, "fixture-bin");
  const qualification = join(root, "qualification");
  mkdirSync(packageRoot, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(qualification, { recursive: true });
  writeFileSync(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ name: "@geekist/llm-core", version: "2.0.0" })}\n`,
  );

  expect(run(["git", "init", "-q"], root).status).toBe(0);
  expect(run(["git", "config", "user.email", "release-fixture@example.test"], root).status).toBe(0);
  expect(run(["git", "config", "user.name", "Release Fixture"], root).status).toBe(0);
  expect(run(["git", "add", "."], root).status).toBe(0);
  expect(run(["git", "commit", "-qm", "release fixture"], root).status).toBe(0);
  const sha = run(["git", "rev-parse", "HEAD"], root).stdout.trim();
  expect(run(["git", "tag", "v2.0.0"], root).status).toBe(0);

  const archive = Buffer.from("spawned qualified archive");
  const tarball = join(qualification, "geekist-llm-core-2.0.0.tgz");
  const artifactPath = join(qualification, "geekist-llm-core-2.0.0.artifact.json");
  writeFileSync(tarball, archive);
  const fixtureArtifact: ArtifactMetadata = {
    schemaVersion: 1,
    package: "@geekist/llm-core",
    version: "2.0.0",
    filename: "geekist-llm-core-2.0.0.tgz",
    tarball: join("/qualified-on-another-runner", "geekist-llm-core-2.0.0.tgz"),
    sha512: `sha512:${createHash("sha512").update(archive).digest("hex")}`,
    integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    inventory: `sha256:${createHash("sha256").update("fixture inventory").digest("hex")}`,
    files: [{ path: "package.json", size: 58 }],
  };
  writeFileSync(artifactPath, `${JSON.stringify(fixtureArtifact)}\n`);

  const state = join(root, "published.state");
  const npmLog = join(root, "npm.log");
  const npmFixture = join(root, "npm-fixture.mjs");
  writeFileSync(
    npmFixture,
    [
      'import { appendFileSync, existsSync, writeFileSync } from "node:fs";',
      "const arguments_ = process.argv.slice(2);",
      'appendFileSync(process.env.TEST_NPM_LOG, arguments_.join(" ") + "\\n");',
      'if (arguments_[0] === "publish") {',
      '  writeFileSync(process.env.TEST_PUBLISHED_STATE, "published\\n");',
      '} else if (arguments_[0] === "view" && arguments_[2] === "dist-tags") {',
      '  console.log(JSON.stringify({ latest: "2.0.0" }));',
      '} else if (arguments_[0] === "view" && existsSync(process.env.TEST_PUBLISHED_STATE)) {',
      "  console.log(process.env.TEST_REGISTRY_METADATA);",
      "} else {",
      "  process.exitCode = 1;",
      "}",
      "",
    ].join("\n"),
  );
  writeExecutable(
    join(bin, "npm"),
    '#!/bin/sh\nset -eu\nexec "$RELEASE_FIXTURE_NODE" "$TEST_NPM_FIXTURE" "$@"\n',
  );
  const ghFixture = join(root, "gh-fixture.mjs");
  writeFileSync(
    ghFixture,
    [
      'const request = process.argv.slice(2).join(" ");',
      'if (request.includes("/git/ref/tags/")) {',
      '  console.log(JSON.stringify({ object: { type: "commit", sha: process.env.TEST_RELEASE_SHA } }));',
      '} else if (request.includes("/compare/")) {',
      '  console.log(JSON.stringify({ status: "identical" }));',
      '} else if (request.includes("/releases/tags/")) {',
      '  console.log(JSON.stringify({ tag_name: "v2.0.0", html_url: "https://github.com/theGeekist/llm-core/releases/tag/v2.0.0" }));',
      "} else {",
      "  process.exitCode = 9;",
      "}",
      "",
    ].join("\n"),
  );
  writeExecutable(
    join(bin, "gh"),
    '#!/bin/sh\nset -eu\nexec "$RELEASE_FIXTURE_NODE" "$TEST_GH_FIXTURE" "$@"\n',
  );

  const key = join(root, "fixture-key.pem");
  const certificate = join(root, "fixture-certificate.pem");
  const certificateDer = join(root, "fixture-certificate.der");
  expect(
    run(
      [
        "openssl",
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=release-fixture",
        "-addext",
        "subjectAltName=URI:https://github.com/theGeekist/llm-core/.github/workflows/release.yml@refs/tags/v2.0.0",
        "-keyout",
        key,
        "-out",
        certificate,
      ],
      root,
    ).status,
  ).toBe(0);
  expect(
    run(["openssl", "x509", "-in", certificate, "-outform", "DER", "-out", certificateDer], root)
      .status,
  ).toBe(0);
  const attestation = JSON.stringify({
    attestations: [
      {
        predicateType: "https://slsa.dev/provenance/v1",
        bundle: {
          dsseEnvelope: {
            payload: Buffer.from(
              JSON.stringify({
                subject: [{ digest: { sha512: fixtureArtifact.sha512.slice("sha512:".length) } }],
              }),
            ).toString("base64"),
          },
          verificationMaterial: {
            certificate: { rawBytes: readFileSync(certificateDer).toString("base64") },
          },
        },
      },
    ],
  });
  const preload = join(root, "fetch-preload.ts");
  writeFileSync(
    preload,
    `globalThis.fetch = async (url) => String(url).includes("attestation")
  ? new Response(process.env.TEST_ATTESTATION_JSON!, { status: 200 })
  : new Response(Buffer.from(process.env.TEST_ARCHIVE_BASE64!, "base64"), { status: 200 });
`,
  );
  const registryMetadata = JSON.stringify({
    version: "2.0.0",
    gitHead: sha,
    dist: {
      integrity: fixtureArtifact.integrity,
      shasum: new Bun.CryptoHasher("sha1").update(archive).digest("hex"),
      tarball: "https://registry.npmjs.org/@geekist/llm-core/-/llm-core-2.0.0.tgz",
      attestations: { url: "https://registry.npmjs.org/-/npm/v1/attestations/attestation" },
    },
  });
  const env = {
    GITHUB_REF: "refs/tags/v2.0.0",
    GITHUB_REPOSITORY: "theGeekist/llm-core",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_RUN_ID: "123",
    GITHUB_SHA: sha,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    RELEASE_FIXTURE_NODE: releaseFixtureNode,
    TEST_ARCHIVE_BASE64: archive.toString("base64"),
    TEST_ATTESTATION_JSON: attestation,
    TEST_GH_FIXTURE: ghFixture,
    TEST_NPM_LOG: npmLog,
    TEST_NPM_FIXTURE: npmFixture,
    TEST_PUBLISHED_STATE: state,
    TEST_REGISTRY_METADATA: registryMetadata,
    TEST_RELEASE_SHA: sha,
  };
  return { artifactPath, controller, env, npmLog, preload, qualification, root, state, tarball };
};

describe("release controller CLI fixture", () => {
  test("executes every CLI phase through Node 24 fixture boundaries", () => {
    const fixture = makeControllerFixture();
    expect(run([releaseFixtureNode, "--version"], fixture.root).stdout.trim()).toMatch(/^v24\./);
    const validate = run(
      [
        process.execPath,
        "--preload",
        fixture.preload,
        fixture.controller,
        "--phase",
        "validate",
        "--package",
        "llm-core",
        "--tag",
        "v2.0.0",
      ],
      fixture.root,
      fixture.env,
    );
    expect(validate.status).toBe(0);
    expect(validate.stdout).toContain("llm-core release validate phase passed (latest)");

    const publish = run(
      [
        process.execPath,
        "--preload",
        fixture.preload,
        fixture.controller,
        "--phase",
        "publish",
        "--package",
        "llm-core",
        "--tag",
        "v2.0.0",
        "--tarball",
        fixture.tarball,
        "--metadata",
        fixture.artifactPath,
      ],
      fixture.root,
      fixture.env,
    );
    expect(publish.status).toBe(0);
    expect(publish.stdout).toContain("llm-core release publish phase passed (latest)");
    expect(existsSync(fixture.state)).toBe(true);
    const npmCalls = readFileSync(fixture.npmLog, "utf8");
    expect(npmCalls).toContain("publish");
    expect(npmCalls).toContain("dist-tags --json");

    const retry = run(
      [
        process.execPath,
        "--preload",
        fixture.preload,
        fixture.controller,
        "--phase",
        "publish",
        "--package",
        "llm-core",
        "--tag",
        "v2.0.0",
        "--tarball",
        fixture.tarball,
        "--metadata",
        fixture.artifactPath,
      ],
      fixture.root,
      fixture.env,
    );
    expect(retry.status).toBe(0);
    expect((readFileSync(fixture.npmLog, "utf8").match(/^publish /gm) ?? []).length).toBe(1);

    const receiptOutput = join(fixture.qualification, "release-receipt.json");
    const receipt = run(
      [
        process.execPath,
        "--preload",
        fixture.preload,
        fixture.controller,
        "--phase",
        "receipt",
        "--package",
        "llm-core",
        "--tag",
        "v2.0.0",
        "--tarball",
        fixture.tarball,
        "--metadata",
        fixture.artifactPath,
        "--receipt-output",
        receiptOutput,
      ],
      fixture.root,
      fixture.env,
    );
    expect(receipt.status).toBe(0);
    const writtenReceipt = JSON.parse(readFileSync(receiptOutput, "utf8")) as {
      readonly npm?: { readonly distTag?: unknown };
      readonly releaseSha?: unknown;
      readonly result?: unknown;
    };
    expect(writtenReceipt).toMatchObject({
      npm: { distTag: "latest" },
      releaseSha: fixture.env.GITHUB_SHA,
      result: "verified",
    });
  });
});
