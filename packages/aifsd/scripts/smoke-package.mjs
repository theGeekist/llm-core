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
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = resolve(packageRoot, "../..");
const strictJsonRoot = resolve(packageRoot, "../strict-json");
const llmCoreRoot = resolve(packageRoot, "../llm-core");
const pipelineRoot = resolve(workspaceRoot, "node_modules/@wpkernel/pipeline");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const prebuilt = process.argv.includes("--prebuilt");

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (index >= 0 && !value) throw new TypeError(`Expected a path after ${name}.`);
  return value ? resolve(process.cwd(), value) : undefined;
};

const supplied = {
  sdk: argumentValue("--tarball"),
  llmCore: argumentValue("--llm-core-tarball"),
  strictJson: argumentValue("--strict-json-tarball"),
  pipeline: argumentValue("--pipeline-tarball"),
};

if (supplied.sdk && (!supplied.llmCore || !supplied.strictJson || !supplied.pipeline)) {
  throw new TypeError(
    "An exact AIFSD tarball requires exact llm-core, strict-json and pipeline tarballs.",
  );
}

const fail = (message) => {
  throw new Error(message);
};

const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    killSignal: "SIGTERM",
    ...options,
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    const detail = result.error instanceof Error ? ` ${result.error.message}` : "";
    fail(`${command} ${arguments_.join(" ")} failed.${detail}`);
  }
  return result.stdout ?? "";
};

const walkFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });

const expectedConfig = [
  "applyPlan",
  "createConfigurationLock",
  "explainConfiguration",
  "planChanges",
  "resolveManifest",
  "validateManifest",
];
const expectedIntegrations = [
  "activateIntegration",
  "createActivationGrant",
  "createCatalogMetadata",
  "createIntegrationProposal",
  "integrationClosureDigest",
  "integrationContentDigest",
  "qualifyIntegration",
  "resolveIntegrationMetadata",
  "resolveLocalIntegrationMetadata",
  "sameDigest",
  "validateIntegrationArtifactBinding",
  "validateIntegrationManifest",
  "validateQualificationEvidence",
  "validateQualificationExecution",
  "verifyIntegrationAcquisition",
];

if (
  packageJson.name !== "@aifsd/sdk" ||
  packageJson.version !== "0.1.0" ||
  packageJson.private !== false ||
  packageJson.engines?.node !== ">=22" ||
  JSON.stringify(Object.keys(packageJson.exports ?? {})) !==
    JSON.stringify(["./config", "./integrations"])
) {
  fail("AIFSD must expose the publishable 0.1.0 config and integrations manifest.");
}

const smokeRoot = mkdtempSync(join(tmpdir(), "aifsd-package-smoke-"));
const packRoot = join(smokeRoot, "pack");
const consumerRoot = join(smokeRoot, "consumer");
const npmCache = join(smokeRoot, "npm-cache");

const pack = (root) => {
  const [{ filename }] = JSON.parse(
    run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", packRoot], {
      cwd: root,
      env: { ...process.env, npm_config_cache: npmCache },
    }),
  );
  return join(packRoot, filename);
};

try {
  mkdirSync(packRoot, { recursive: true });
  mkdirSync(consumerRoot, { recursive: true });
  if (!prebuilt && !supplied.sdk) {
    run("bun", ["run", "build"], { cwd: strictJsonRoot });
    run("bun", ["run", "build"], { cwd: llmCoreRoot });
    run("bun", ["run", "build"], { cwd: packageRoot });
  }

  const archives = {
    strictJson: supplied.strictJson ?? pack(strictJsonRoot),
    llmCore: supplied.llmCore ?? pack(llmCoreRoot),
    pipeline: supplied.pipeline ?? pack(pipelineRoot),
    sdk: supplied.sdk ?? pack(packageRoot),
  };
  for (const [name, archive] of Object.entries(archives)) {
    if (!existsSync(archive)) fail(`Missing ${name} archive: ${archive}`);
  }

  writeFileSync(
    join(consumerRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "aifsd-exact-archive-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@aifsd/sdk": `file:${archives.sdk}`,
          "@geekist/llm-core": `file:${archives.llmCore}`,
          "@aifsd/strict-json": `file:${archives.strictJson}`,
          "@wpkernel/pipeline": `file:${archives.pipeline}`,
        },
      },
      null,
      2,
    )}\n`,
  );
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], {
    cwd: consumerRoot,
    env: { ...process.env, npm_config_cache: npmCache },
  });

  const installedRoot = join(consumerRoot, "node_modules/@aifsd/sdk");
  const installedManifest = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8"));
  if (
    installedManifest.name !== packageJson.name ||
    installedManifest.version !== packageJson.version
  ) {
    fail("Installed AIFSD identity differs from the exact archive manifest.");
  }
  const forbidden = walkFiles(installedRoot)
    .map((path) => relative(installedRoot, path).split("\\").join("/"))
    .filter((path) => /(?:qualification-host|trust-host)\.d\.(?:ts|ts\.map)$/.test(path));
  if (forbidden.length > 0) {
    fail(`Host-only declarations escaped the package: ${forbidden.join(", ")}`);
  }

  writeFileSync(
    join(consumerRoot, "runtime.mjs"),
    [
      'const config = await import("@aifsd/sdk/config");',
      'const integrations = await import("@aifsd/sdk/integrations");',
      `if (JSON.stringify(Object.keys(config).sort()) !== ${JSON.stringify(JSON.stringify(expectedConfig))}) throw new Error("config export drift");`,
      `if (JSON.stringify(Object.keys(integrations).sort()) !== ${JSON.stringify(JSON.stringify(expectedIntegrations))}) throw new Error("integrations export drift");`,
      'if ("createQualificationService" in integrations || "createTrustService" in integrations) throw new Error("host constructor escaped");',
      "",
    ].join("\n"),
  );
  run("node", ["runtime.mjs"], { cwd: consumerRoot });

  writeFileSync(
    join(consumerRoot, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          strict: true,
          target: "ES2022",
          skipLibCheck: false,
          types: [],
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumerRoot, "consumer.ts"),
    [
      'import { validateManifest, type Manifest } from "@aifsd/sdk/config";',
      'import { validateIntegrationManifest, type IntegrationManifest } from "@aifsd/sdk/integrations";',
      "const configuration: Manifest | undefined = validateManifest({}).ok ? undefined : undefined;",
      "const integration: IntegrationManifest | undefined = undefined;",
      "const validateIntegration: typeof validateIntegrationManifest = validateIntegrationManifest;",
      "void configuration;",
      "void integration;",
      "void validateIntegration;",
      "",
    ].join("\n"),
  );
  run(resolve(workspaceRoot, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], {
    cwd: consumerRoot,
  });
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}
