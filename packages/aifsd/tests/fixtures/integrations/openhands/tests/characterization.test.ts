import { describe, expect, test } from "bun:test";
import { digest, type Digest } from "@aifsd/llm-core/contracts";
import {
  integrationContentDigest,
  resolveLocalIntegrationMetadata,
} from "../../../../../src/integrations/index.ts";

const sha = (seed: string): Digest =>
  digest(new Bun.CryptoHasher("sha256").update(seed).digest("hex"));

describe("OpenHands characterisation", () => {
  test("resolves closed metadata without importing package code", async () => {
    const manifest = await Bun.file(
      new URL("../integration/manifest.json", import.meta.url),
    ).json();
    const rootArtifact = {
      id: manifest.identity.name,
      version: manifest.identity.version,
      digest: sha("root"),
    };
    const executableClosure = {
      root: rootArtifact,
      representation: { kind: "package-lock" as const, lockDigest: sha("uv-lock") },
    };
    const resolved = resolveLocalIntegrationMetadata({
      releases: [
        {
          source: "local",
          manifest,
          manifestDigest: integrationContentDigest(manifest),
          rootArtifact,
          executableClosure,
        },
      ],
      name: manifest.identity.name,
      version: manifest.identity.version,
    });
    expect(resolved.ok).toBe(true);
    expect(manifest.entrypoints.metadata).toBe("./integration/manifest.json");
    expect(manifest.upstreams[0].version).toBe("1.37.1");
    expect(
      manifest.operations.map(({ disposition }: { disposition: string }) => disposition),
    ).toEqual(["supported", "unsupported"]);
  });

  test("labels unsupported durability as pinned-source evidence", async () => {
    const source = await Bun.file(
      new URL("../qualification/unsupported-evidence.json", import.meta.url),
    ).json();
    expect(source.operationId).toBe("native.distributed-workflow-durability");
    expect(source.basis).toBe("pinned-source");
  });
});
