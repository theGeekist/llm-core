import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { digest, type Digest } from "@aifsd/llm-core/contracts";

export interface PackedArtifact {
  readonly path: string;
  readonly digest: Digest;
}

export const createPackedArtifact = async (): Promise<PackedArtifact> => {
  const destination = join(process.cwd(), "dist", "artifacts");
  mkdirSync(destination, { recursive: true });
  const packed = Bun.spawnSync(["npm", "pack", "--json", "--pack-destination", destination], {
    env: {
      HOME: destination,
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
      npm_config_cache: join(destination, ".npm-cache"),
      npm_config_ignore_scripts: "true",
    },
    stdout: "pipe",
    stderr: "inherit",
  });
  if (packed.exitCode !== 0) throw new Error("npm pack failed");
  const [{ filename }] = JSON.parse(packed.stdout.toString()) as [{ filename: string }];
  const path = join(destination, filename);
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  return {
    path,
    digest: digest(createHash("sha256").update(bytes).digest("hex")),
  };
};
