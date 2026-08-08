import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const artifacts = join(process.cwd(), "dist", "artifacts");
const tarballs = readdirSync(artifacts).filter((file) => file.endsWith(".tgz"));
if (tarballs.length !== 1) {
  throw new Error("qualification must produce exactly one packed artefact");
}
const directory = mkdtempSync(join(tmpdir(), "aifsd-openhands-pack-"));
const consumer = join(directory, "consumer");
const tarball = join(artifacts, tarballs[0]!);
const install = Bun.spawnSync(
  ["npm", "install", "--ignore-scripts", "--no-package-lock", "--prefix", consumer, tarball],
  { stdout: "inherit", stderr: "inherit" },
);
if (install.exitCode !== 0) throw new Error("isolated install failed");
const imported = Bun.spawnSync(
  [
    "node",
    "--input-type=module",
    "-e",
    "import('aifsd-fixture-openhands').then(m => { if (m.upstream.version !== '1.37.1') process.exit(1) })",
  ],
  { cwd: consumer, stdout: "inherit", stderr: "inherit" },
);
if (imported.exitCode !== 0) throw new Error("public entrypoint import failed");
