import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageManifest {
  readonly dependencies?: Record<string, string>;
  readonly name: string;
  readonly version: string;
}

const root = resolve(import.meta.dir, "..");
const readManifest = (path: string): PackageManifest =>
  JSON.parse(readFileSync(resolve(root, path), "utf8")) as PackageManifest;

const strictJson = readManifest("packages/strict-json/package.json");
const llmCore = readManifest("packages/llm-core/package.json");
const declaredVersion = llmCore.dependencies?.[strictJson.name];
if (declaredVersion !== strictJson.version) {
  throw new Error(
    `${llmCore.name} must depend on ${strictJson.name} at workspace version ${strictJson.version}.`,
  );
}

const coordinate = `${strictJson.name}@${strictJson.version}`;
const result = Bun.spawnSync(["npm", "view", coordinate, "version", "--json"], {
  stderr: "pipe",
  stdout: "pipe",
});
if (result.exitCode !== 0) {
  throw new Error(`${coordinate} must be published before ${llmCore.name}.`);
}

const publishedVersion = JSON.parse(result.stdout.toString()) as unknown;
if (publishedVersion !== strictJson.version) {
  throw new Error(`Registry returned an unexpected version for ${coordinate}.`);
}
