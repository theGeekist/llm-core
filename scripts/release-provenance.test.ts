import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readRequiredReleasePlan,
  validateChangeFragment,
  validateReleasePlan,
  validateReleaseReceipt,
  validateRepositoryProvenance,
} from "./release-provenance";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fragment = {
  schemaVersion: 1,
  id: "release-v2-candidate",
  package: "@geekist/llm-core",
  tasks: ["llm-core/release-history-provenance"],
  decisions: ["llm-core/ADR-007", "llm-core/ADR-015"],
  releaseImpact: "major",
  summary: "Prepare the first evidence-backed v2 release.",
  affectedExports: [".", "./a2a", "./mcp"],
  contributors: ["Jason Nathan"],
  assistance: [{ system: "OpenAI Codex", role: "implementation and review" }],
} as const;

const plan = {
  schemaVersion: 1,
  package: "@geekist/llm-core",
  version: "2.0.0",
  classification: "current",
  sourceSha: "a".repeat(40),
  releaseSha: "SELF",
  tag: "v2.0.0",
  sourceTree: "b".repeat(40),
  releaseTree: "SELF",
  approvedMetadataPaths: ["packages/llm-core/package.json", "packages/llm-core/CHANGELOG.md"],
  fragments: [
    {
      path: "packages/llm-core/changes/released/2.0.0/release-v2-candidate.json",
      blob: "c".repeat(40),
    },
  ],
  dependencies: {
    "@aifsd/strict-json": "0.1.0",
    "@wpkernel/pipeline": "1.4.0",
  },
  digests: {
    manifest: `sha256:${"d".repeat(64)}`,
    lockfile: `sha256:${"e".repeat(64)}`,
    qualifierRegistry: `sha256:${"f".repeat(64)}`,
  },
  toolchain: { bun: "1.3.14", node: "22" },
  supportDeclarations: [
    {
      surface: "./a2a",
      window: "A2A specification 1.0.0 and @a2a-js/sdk 1.0.0",
      qualifier: "a2a-1.0",
      owner: "protocol-maintainer",
    },
  ],
} as const;

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
    runId: "123",
    attempt: 1,
    repository: "theGeekist/llm-core",
    ref: "refs/tags/v2.0.0",
    sha: "b".repeat(40),
  },
  artifact: {
    sha512: `sha512:${"d".repeat(128)}`,
    inventory: `sha256:${"e".repeat(64)}`,
    filename: "geekist-llm-core-2.0.0.tgz",
  },
  npm: {
    integrity: `sha512-${Buffer.alloc(64, 7).toString("base64")}`,
    shasum: "1".repeat(40),
    distTag: "latest",
    tarball: "https://registry.npmjs.org/example.tgz",
    gitHead: "b".repeat(40),
  },
  githubRelease: { url: "https://github.com/theGeekist/llm-core/releases/tag/v2.0.0" },
  attestation: {
    identity: "https://github.com/theGeekist/llm-core/.github/workflows/release.yml",
    url: "https://registry.npmjs.org/-/npm/v1/attestations/example",
  },
  verifiedAt: "2026-08-09T15:00:00.000Z",
  result: "verified",
} as const;

describe("release provenance", () => {
  test("accepts a closed, factual change fragment", () => {
    expect(validateChangeFragment(fragment)).toEqual([]);
  });

  test("rejects unknown fragment keys and unreasoned none impact", () => {
    expect(
      validateChangeFragment({
        ...fragment,
        releaseImpact: "none",
        invented: true,
      }).join("\n"),
    ).toContain("unknown key invented");
    expect(validateChangeFragment({ ...fragment, releaseImpact: "none" }).join("\n")).toContain(
      "reason is required",
    );
  });

  test("keeps assistance separate from conventional authorship", () => {
    expect(
      validateChangeFragment({
        ...fragment,
        assistance: [{ system: "OpenAI Codex", role: "review", author: true }],
      }).join("\n"),
    ).toContain("must contain only system and role");
  });

  test("accepts a pre-publication plan with SELF release identity", () => {
    expect(validateReleasePlan(plan)).toEqual([]);
  });

  test("accepts the bounded AIFSD candidate and exact dependency topology", () => {
    expect(
      validateReleasePlan({
        ...plan,
        package: "@aifsd/sdk",
        version: "0.1.0",
        tag: "aifsd-v0.1.0",
        fragments: [
          {
            path: "packages/aifsd/changes/released/0.1.0/aifsd-config-integrations-candidate.json",
            blob: "c".repeat(40),
          },
        ],
        dependencies: {
          "@geekist/llm-core": "2.0.0",
          "@aifsd/strict-json": "0.1.0",
          "@wpkernel/pipeline": "1.4.0",
        },
        supportDeclarations: [
          {
            surface: "./config",
            window: "@aifsd/sdk 0.1.0",
            qualifier: "aifsd-package-smoke",
            owner: "aifsd-maintainer",
          },
          {
            surface: "./integrations",
            window: "@aifsd/sdk 0.1.0",
            qualifier: "aifsd-package-smoke",
            owner: "aifsd-maintainer",
          },
        ],
      }),
    ).toEqual([]);
  });

  test("requires exact package tag and immutable fragment blobs", () => {
    expect(validateReleasePlan({ ...plan, tag: "v2.0.1" }).join("\n")).toContain(
      "tag must exactly match",
    );
    expect(
      validateReleasePlan({
        ...plan,
        fragments: [{ ...plan.fragments[0], blob: "short" }],
      }).join("\n"),
    ).toContain("Git blob SHA");
  });

  test("rejects incomplete plan digests and mutable dependency ranges", () => {
    expect(
      validateReleasePlan({
        ...plan,
        dependencies: { "@aifsd/strict-json": "^0.1.0" },
        digests: { manifest: "sha256:bad" },
      }).join("\n"),
    ).toContain("exact semantic versions");
    expect(
      validateReleasePlan({
        ...plan,
        digests: { manifest: "sha256:bad" },
      }).join("\n"),
    ).toContain("manifest and lockfile digests");
  });

  test("rejects traversal, short digests and unstructured support declarations", () => {
    const errors = validateReleasePlan({
      ...plan,
      approvedMetadataPaths: ["../../outside"],
      fragments: [{ path: "elsewhere.json", blob: "c".repeat(40) }],
      digests: { manifest: "sha256:a", lockfile: "sha256:b", qualifierRegistry: "sha256:c" },
      supportDeclarations: [false],
    }).join("\n");
    expect(errors).toContain("canonical repository-relative paths");
    expect(errors).toContain("must live under");
    expect(errors).toContain("exact SHA-256");
    expect(errors).toContain("supportDeclarations[0] must be an object");
  });

  test("accepts a complete post-publication receipt", () => {
    expect(validateReleaseReceipt(receipt)).toEqual([]);
  });

  test("rejects receipts that predict or omit registry evidence", () => {
    expect(
      validateReleaseReceipt({
        ...receipt,
        releaseSha: "SELF",
        npm: { ...receipt.npm, integrity: "" },
        result: "pending",
      }).join("\n"),
    ).toContain("releaseSha must be a full Git SHA");
    expect(
      validateReleaseReceipt({
        ...receipt,
        npm: { ...receipt.npm, integrity: "" },
      }).join("\n"),
    ).toContain("exact integrity, shasum, dist-tag and registry tarball");
    expect(
      validateReleaseReceipt({
        ...receipt,
        npm: {
          integrity: receipt.npm.integrity,
          shasum: receipt.npm.shasum,
          distTag: receipt.npm.distTag,
          tarball: receipt.npm.tarball,
        },
      }),
    ).toEqual([]);
    expect(validateReleaseReceipt({ ...receipt, result: "pending" }).join("\n")).toContain(
      "result must be verified",
    );
  });

  test("rejects mismatched receipt identity and fabricated URLs or timestamps", () => {
    const errors = validateReleaseReceipt({
      ...receipt,
      tag: "strict-json-v9.9.9",
      repository: "wrong/repository",
      workflow: { ...receipt.workflow, repository: "wrong/repository" },
      artifact: { ...receipt.artifact, sha512: "sha512:a" },
      npm: { ...receipt.npm, tarball: "not a URL" },
      githubRelease: { url: "not a URL" },
      attestation: { identity: "anything", url: "not a URL" },
      verifiedAt: "2026",
    }).join("\n");
    expect(errors).toContain("tag must exactly match");
    expect(errors).toContain("repository must be theGeekist/llm-core");
    expect(errors).toContain("exact archive");
    expect(errors).toContain("registry tarball");
    expect(errors).toContain("GitHub HTTPS URL");
    expect(errors).toContain("UTC RFC 3339");
  });

  test("requires a plan and binds a receipt to its sibling plan", () => {
    const root = mkdtempSync(join(tmpdir(), "release-provenance-repository-"));
    roots.push(root);
    const releaseRoot = join(root, "packages/llm-core/releases/2.0.0");
    mkdirSync(releaseRoot, { recursive: true });
    expect(() => readRequiredReleasePlan(root, "llm-core", "2.0.0")).toThrow(
      "Missing mandatory release plan",
    );
    writeFileSync(join(releaseRoot, "receipt.json"), `${JSON.stringify(receipt)}\n`);
    expect(validateRepositoryProvenance(root, "llm-core").join("\n")).toContain(
      "requires a sibling plan.json",
    );
  });
});
