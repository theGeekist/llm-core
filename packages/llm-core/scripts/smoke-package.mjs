import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = resolve(root, "../..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const workspacePackageJson = JSON.parse(readFileSync(join(workspaceRoot, "package.json"), "utf8"));
const expectedSubpaths = [
  ".",
  "./functional",
  "./contracts",
  "./model",
  "./tools",
  "./control",
  "./evidence",
  "./state",
  "./agent",
  "./workflow",
  "./interaction",
  "./adapters/ai-sdk",
  "./adapters/ai-sdk-ui",
  "./adapters/assistant-ui",
  "./adapters/openai-chatkit",
  "./adapters/nlux-ui",
];

const fail = (message) => {
  throw new Error(message);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    fail(`${command} ${args.join(" ")} failed.`);
  }
  return result.stdout ?? "";
};

const walkFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });

const containsSourceAlias = (source) => source.includes('"#') || source.includes("'#");

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
  fail(`Package smoke requires Node.js >=22; received ${process.versions.node}.`);
}
if (workspacePackageJson.engines?.node !== ">=22" || packageJson.engines?.node !== ">=22") {
  fail('Workspace and package must declare Node.js ">=22".');
}
if (
  packageJson.version !== "2.0.0" ||
  packageJson.type !== "module" ||
  packageJson.main !== "./dist/esm/index.js" ||
  packageJson.module !== "./dist/esm/index.js"
) {
  fail("Package must publish the v2 ESM-only manifest.");
}
if (JSON.stringify(Object.keys(packageJson.exports)) !== JSON.stringify(expectedSubpaths)) {
  fail("Package exports must match the exact ordered ADR-008 surface.");
}

const runtimeTargets = new Set();
const typeTargets = new Set();
for (const [subpath, conditions] of Object.entries(packageJson.exports)) {
  if (
    typeof conditions !== "object" ||
    conditions === null ||
    Array.isArray(conditions) ||
    Object.hasOwn(conditions, "browser") ||
    Object.hasOwn(conditions, "require") ||
    conditions.import !== conditions.default
  ) {
    fail(`Export ${subpath} must use types/import/default ESM conditions only.`);
  }
  const conditionKeys = Object.keys(conditions);
  if (conditionKeys.join(",") !== "types,import,default") {
    fail(`Export ${subpath} has unexpected conditions: ${conditionKeys.join(",")}.`);
  }
  if (
    !conditions.import.startsWith("./dist/esm/") ||
    !conditions.import.endsWith(".js") ||
    !conditions.types.startsWith("./dist/types/") ||
    !conditions.types.endsWith(".d.ts")
  ) {
    fail(`Export ${subpath} has an invalid runtime or declaration target.`);
  }
  runtimeTargets.add(conditions.import);
  typeTargets.add(conditions.types);
}

for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (/\bcjs\b|commonjs/i.test(`${name} ${command}`)) {
    fail(`CommonJS build script remains: ${name}`);
  }
}

const staleCjsArtifacts = [join(root, "dist", "cjs", "stale.cjs"), join(root, "dist", "stale.cjs")];
for (const artifact of staleCjsArtifacts) {
  mkdirSync(dirname(artifact), { recursive: true });
  writeFileSync(artifact, "module.exports = {};\n");
}
run("bun", ["run", "build"], { cwd: root });

for (const artifact of staleCjsArtifacts) {
  if (existsSync(artifact)) fail(`Build retained ${relative(root, artifact)}.`);
}
for (const target of [...runtimeTargets, ...typeTargets]) {
  if (!existsSync(join(root, target))) fail(`Missing manifest target: ${target}`);
}
for (const file of walkFiles(join(root, "dist"))) {
  const path = relative(root, file);
  if (path.split(sep).includes("cjs") || file.endsWith(".cjs")) {
    fail(`CommonJS artifact remains: ${path}`);
  }
  if (file.endsWith(".js") && containsSourceAlias(readFileSync(file, "utf8"))) {
    fail(`Built JavaScript retains a source-only alias: ${path}`);
  }
  if (file.endsWith(".d.ts") && containsSourceAlias(readFileSync(file, "utf8"))) {
    fail(`Declaration retains a source-only alias: ${path}`);
  }
}

const smokeRoot = mkdtempSync(join(workspaceRoot, ".package-smoke-"));
try {
  const packedOutput = run("npm", ["pack", "--json", "--pack-destination", smokeRoot], {
    cwd: root,
    env: { ...process.env, npm_config_cache: join(smokeRoot, "npm-cache") },
  });
  const packed = JSON.parse(packedOutput);
  const tarball = join(smokeRoot, packed[0].filename);
  const consumer = join(smokeRoot, "consumer");
  const installed = join(consumer, "node_modules", "@geekist", "llm-core");
  mkdirSync(installed, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", installed, "--strip-components=1"]);

  const specifiers = expectedSubpaths.map((subpath) =>
    subpath === "." ? "@geekist/llm-core" : `@geekist/llm-core/${subpath.slice(2)}`,
  );
  const runtimeImports = specifiers
    .map((specifier) => `await import(${JSON.stringify(specifier)});`)
    .join("\n");
  writeFileSync(join(consumer, "runtime.mjs"), `${runtimeImports}\n`);
  run(process.execPath, ["runtime.mjs"], { cwd: consumer });

  writeFileSync(
    join(consumer, "consumer.ts"),
    [
      'import { createLocalAgentRunner, prepareAgentSpec } from "@geekist/llm-core";',
      'import type { AgentSpec, PreparedAgentSpec, AgentRunner, AgentRunnerCapabilities, AgentRun, AgentRunRequest, AgentRunEvent, RunResult, MaybePromise, MaybeAsyncIterable } from "@geekist/llm-core";',
      ...specifiers
        .slice(1)
        .map(
          (specifier, index) => `import * as surface${index} from ${JSON.stringify(specifier)};`,
        ),
      "void createLocalAgentRunner; void prepareAgentSpec;",
      "type RootTypes = [AgentSpec, PreparedAgentSpec, AgentRunner, AgentRunnerCapabilities, AgentRun, AgentRunRequest, AgentRunEvent, RunResult, MaybePromise<unknown>, MaybeAsyncIterable<unknown>];",
      "declare const rootTypes: RootTypes; void rootTypes;",
      ...specifiers.slice(1).map((_, index) => `void surface${index};`),
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ESNext",
          module: "ESNext",
          moduleResolution: "Bundler",
          skipLibCheck: true,
          types: [],
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    ),
  );
  run(resolve(workspaceRoot, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], {
    cwd: consumer,
  });
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}

console.log(
  "Verified 16 ESM-only v2 exports from an isolated packed runtime and declaration consumer.",
);
