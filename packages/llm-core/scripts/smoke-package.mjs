import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = resolve(root, "../..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const workspacePackageJson = JSON.parse(readFileSync(join(workspaceRoot, "package.json"), "utf8"));
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

const fail = (message) => {
  throw new Error(message);
};

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
  fail(`Package smoke requires Node.js >=22; received ${process.versions.node}.`);
}
if (workspacePackageJson.engines?.node !== ">=22") {
  fail('Workspace must declare the supported Node.js baseline as ">=22".');
}
if (packageJson.type !== "module") {
  fail('Package must declare "type": "module".');
}
if (packageJson.engines?.node !== ">=22") {
  fail('Package must declare the supported Node.js baseline as ">=22".');
}
if (packageJson.main !== "./dist/esm/index.js" || packageJson.module !== "./dist/esm/index.js") {
  fail("Package main/module targets must use the ESM build.");
}

for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (/\bcjs\b|commonjs/i.test(`${name} ${command}`)) {
    fail(`CommonJS build script remains: ${name}`);
  }
}

const packageExports = Object.entries(packageJson.exports ?? {});
if (packageExports.length === 0) {
  fail("Package must expose at least one public export.");
}

const runtimeTargets = new Set();
const inspectExportTarget = (subpath, target, conditionPath = []) => {
  if (typeof target === "string") {
    if (/(?:^|\/)cjs(?:\/|$)|\.cjs$/i.test(target)) {
      fail(`Export ${subpath} retains a CommonJS target: ${target}`);
    }
    const isTypeTarget = conditionPath.includes("types") || target.endsWith(".d.ts");
    if (!isTypeTarget) {
      if (!target.startsWith("./dist/esm/") || !target.endsWith(".js")) {
        fail(`Export ${subpath} runtime target is not ESM: ${target}`);
      }
      runtimeTargets.add(target);
    }
    return;
  }
  if (typeof target !== "object" || target === null || Array.isArray(target)) {
    fail(`Export ${subpath} contains an invalid target.`);
  }
  for (const [condition, value] of Object.entries(target)) {
    if (condition === "require") {
      fail(`Export ${subpath} retains a CommonJS require condition.`);
    }
    inspectExportTarget(subpath, value, [...conditionPath, condition]);
  }
};

for (const [subpath, target] of packageExports) {
  inspectExportTarget(subpath, target);
}
if (runtimeTargets.size === 0) {
  fail("Package exports contain no ESM runtime targets.");
}

for (const dependency of requiredAdapterPeers) {
  if (!packageJson.peerDependencies?.[dependency] && !packageJson.dependencies?.[dependency]) {
    fail(`Missing runtime dependency metadata for ${dependency}`);
  }
}

// Seed a stale CommonJS artifact, then prove the package build removes it.
const staleCjsArtifacts = [join(root, "dist", "cjs", "stale.cjs"), join(root, "dist", "stale.cjs")];
for (const staleCjs of staleCjsArtifacts) {
  mkdirSync(dirname(staleCjs), { recursive: true });
  writeFileSync(staleCjs, "module.exports = {};\n");
}

const build = spawnSync("bun", ["run", "build"], {
  cwd: root,
  encoding: "utf8",
});
if (build.status !== 0) {
  process.stdout.write(build.stdout);
  process.stderr.write(build.stderr);
  process.exit(build.status ?? 1);
}
for (const staleCjs of staleCjsArtifacts) {
  if (existsSync(staleCjs)) {
    fail(`Build did not remove seeded CommonJS artifact: ${relative(root, staleCjs)}`);
  }
}

const distFiles = walkFiles(join(root, "dist"));
for (const file of distFiles) {
  const relativePath = relative(root, file);
  const segments = relativePath.split(sep);
  if (segments.includes("cjs") || file.endsWith(".cjs")) {
    fail(`CommonJS artifact remains after build: ${relativePath}`);
  }
  if (!file.endsWith(".js")) {
    continue;
  }
  const source = readFileSync(file, "utf8");
  if (/\b(?:from\s*|import\s*\(?\s*)["']#[^"']+/.test(source)) {
    fail(`Built artifact retains an internal package alias: ${relativePath}`);
  }
}

const esmPaths = [...runtimeTargets].map((runtimeTarget) => {
  const absoluteTarget = join(root, runtimeTarget);
  if (!existsSync(absoluteTarget)) {
    fail(`Export points to a missing ESM artifact: ${runtimeTarget}`);
  }
  return pathToFileURL(absoluteTarget).href;
});
const smoke = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "--eval",
    esmPaths.map((path) => `await import(${JSON.stringify(path)});`).join("\n"),
  ],
  { encoding: "utf8" },
);
if (smoke.status !== 0) {
  process.stderr.write(smoke.stderr);
  process.exit(smoke.status ?? 1);
}

console.log(
  `Loaded ${runtimeTargets.size} ESM runtime targets from ${packageExports.length} package exports; stale CommonJS cleanup verified.`,
);
