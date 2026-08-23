import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArtifactMetadata } from "./prepare-artifact";
import {
  inspectProvenanceIdentity,
  validateTaggedReleaseIdentity,
  verifyRegistryArtifact,
  verifyRegistryDistTag,
} from "./release-controller";

const archive = Buffer.from("qualified archive");
const artifact: ArtifactMetadata = {
  schemaVersion: 1,
  package: "@geekist/llm-core",
  version: "2.0.0",
  filename: "geekist-llm-core-2.0.0.tgz",
  tarball: join(tmpdir(), "geekist-llm-core-2.0.0.tgz"),
  sha512: `sha512:${createHash("sha512").update(archive).digest("hex")}`,
  integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
  inventory: `sha256:${"a".repeat(64)}`,
  files: [],
};

const metadata = {
  version: "2.0.0",
  gitHead: "b".repeat(40),
  dist: {
    integrity: artifact.integrity,
    shasum: createHash("sha1").update(archive).digest("hex"),
    tarball: "https://registry.npmjs.org/@geekist/llm-core/-/llm-core-2.0.0.tgz",
  },
};

describe("release controller", () => {
  test("admits a tagged manifest release without a release plan ceremony", () => {
    expect(() =>
      validateTaggedReleaseIdentity({
        version: "2.0.0",
        tag: "v2.0.0",
        tagPrefix: "v",
        head: "b".repeat(40),
        workflowSha: "b".repeat(40),
      }),
    ).not.toThrow();
    expect(readFileSync(join(import.meta.dir, "release-controller.ts"), "utf8")).not.toContain(
      "validatePlanAgainstGit(root, arguments_",
    );
    expect(() =>
      validateTaggedReleaseIdentity({
        version: "2.0.0",
        tag: "v2.0.1",
        tagPrefix: "v",
        head: "b".repeat(40),
        workflowSha: "b".repeat(40),
      }),
    ).toThrow("tag must exactly match");
    expect(() =>
      validateTaggedReleaseIdentity({
        version: "2.0.0",
        tag: "v2.0.0",
        tagPrefix: "v",
        head: "b".repeat(40),
        workflowSha: "c".repeat(40),
      }),
    ).toThrow("differs from GITHUB_SHA");
  });

  test("accepts registry bytes with matching integrity and optional matching gitHead", async () => {
    await expect(
      verifyRegistryArtifact({
        metadata,
        artifact,
        releaseSha: "b".repeat(40),
        download: async () => archive,
      }),
    ).resolves.toBeUndefined();
    await expect(
      verifyRegistryArtifact({
        metadata: { ...metadata, gitHead: undefined },
        artifact,
        releaseSha: "b".repeat(40),
        download: async () => archive,
      }),
    ).resolves.toBeUndefined();
  });

  test("rejects immutable registry conflicts on retry", async () => {
    await expect(
      verifyRegistryArtifact({
        metadata,
        artifact,
        releaseSha: "b".repeat(40),
        download: async () => Buffer.from("other"),
      }),
    ).rejects.toThrow("differ from the qualified archive");
    await expect(
      verifyRegistryArtifact({
        metadata: { ...metadata, gitHead: "c".repeat(40) },
        artifact,
        releaseSha: "b".repeat(40),
        download: async () => archive,
      }),
    ).rejects.toThrow("gitHead differs");
    await expect(
      verifyRegistryArtifact({
        metadata: { ...metadata, dist: { ...metadata.dist, shasum: "0".repeat(40) } },
        artifact,
        releaseSha: "b".repeat(40),
        download: async () => archive,
      }),
    ).rejects.toThrow("shasum differs");
    expect(() => verifyRegistryDistTag({ latest: "1.0.0" }, "latest", "2.0.0")).toThrow(
      "dist-tag latest differs",
    );
  });

  test("rejects non-registry tarball locations", async () => {
    await expect(
      verifyRegistryArtifact({
        metadata: {
          ...metadata,
          dist: { ...metadata.dist, tarball: "https://example.com/archive.tgz" },
        },
        artifact,
        releaseSha: "b".repeat(40),
        download: async () => archive,
      }),
    ).rejects.toThrow("canonical tarball URL");
  });

  test("rejects provenance whose subject is not the qualified archive", async () => {
    const payload = Buffer.from(
      JSON.stringify({ subject: [{ digest: { sha512: "0".repeat(128) } }] }),
    ).toString("base64");
    await expect(
      inspectProvenanceIdentity("https://registry.npmjs.org/attestation", artifact, {
        tag: "v2.0.0",
        download: async () => ({
          attestations: [
            {
              predicateType: "https://slsa.dev/provenance/v1",
              bundle: {
                dsseEnvelope: { payload },
                verificationMaterial: { certificate: { rawBytes: "not-a-certificate" } },
              },
            },
          ],
        }),
      }),
    ).rejects.toThrow("subject does not match");
  });
});
