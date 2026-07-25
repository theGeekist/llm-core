import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const requiredAdapterPeers = [
  "@ai-sdk/anthropic",
  "@ai-sdk/openai",
  "@langchain/core",
  "@langchain/ollama",
  "@langchain/openai",
  "@llamaindex/core",
  "@llamaindex/openai",
  "@llamaindex/workflow-core",
  "ai",
  "assistant-stream",
  "ollama-ai-provider-v2",
  "zod-to-json-schema",
];

const walkFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });

for (const dependency of requiredAdapterPeers) {
  if (!packageJson.peerDependencies?.[dependency] && !packageJson.dependencies?.[dependency]) {
    throw new Error(`Missing runtime dependency metadata for ${dependency}`);
  }
}

for (const file of walkFiles(join(root, "dist"))) {
  if (!/\.(?:js|cjs)$/.test(file)) {
    continue;
  }
  const source = readFileSync(file, "utf8");
  if (/\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["']#[^"']+/.test(source)) {
    throw new Error(`Built artifact retains an internal package alias: ${relative(root, file)}`);
  }
}

const exportedPaths = Object.values(packageJson.exports);
const esmPaths = exportedPaths.map((target) => pathToFileURL(join(root, target.import)).href);
const cjsPaths = exportedPaths.map((target) => join(root, target.require));
const smokeRuns = [
  [
    "--input-type=module",
    "--eval",
    esmPaths.map((path) => `await import(${JSON.stringify(path)});`).join("\n"),
  ],
  ["--eval", cjsPaths.map((path) => `require(${JSON.stringify(path)});`).join("\n")],
];

for (const args of smokeRuns) {
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

console.log(`Loaded ${exportedPaths.length} package exports through ESM and CJS.`);
