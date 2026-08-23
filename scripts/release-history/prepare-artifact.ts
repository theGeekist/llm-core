import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

type PackageKey = "aifsd" | "llm-core" | "strict-json";

interface PackFile {
  readonly path: string;
  readonly size: number;
}

interface PackResult {
  readonly filename: string;
  readonly files: readonly PackFile[];
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

export interface ArtifactMetadata {
  readonly schemaVersion: 1;
  readonly package: string;
  readonly version: string;
  readonly filename: string;
  readonly tarball: string;
  readonly sha512: string;
  readonly integrity: string;
  readonly inventory: string;
  readonly files: readonly PackFile[];
}

const packageDirectories: Readonly<Record<PackageKey, string>> = {
  aifsd: "packages/aifsd",
  "llm-core": "packages/llm-core",
  "strict-json": "packages/strict-json",
};

const digest = (algorithm: "sha256" | "sha512", value: string | Buffer): string =>
  createHash(algorithm).update(value).digest("hex");

export const canonicalInventory = (files: readonly PackFile[]): string =>
  `${files
    .map(({ path, size }) => ({ path, size }))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ path, size }) => `${path}\0${size}`)
    .join("\n")}\n`;

const pack = (packageRoot: string, outputRoot: string): PackResult => {
  const result = Bun.spawnSync(
    ["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", outputRoot],
    {
      cwd: packageRoot,
      stderr: "pipe",
      stdout: "pipe",
      timeout: 10 * 60_000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, npm_config_cache: join(outputRoot, "npm-cache") },
    },
  );
  const stdout = result.stdout.toString();
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString() || stdout || "npm pack failed");
  }
  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new TypeError("npm pack must return exactly one artifact");
  }
  const entry = parsed[0] as Partial<PackResult>;
  if (
    typeof entry.filename !== "string" ||
    typeof entry.name !== "string" ||
    typeof entry.version !== "string" ||
    typeof entry.id !== "string" ||
    !Array.isArray(entry.files)
  ) {
    throw new TypeError("npm pack returned incomplete artifact metadata");
  }
  return entry as PackResult;
};

export const prepareArtifact = (packageRoot: string, outputRoot: string): ArtifactMetadata => {
  mkdirSync(outputRoot, { recursive: true });
  const packed = pack(packageRoot, outputRoot);
  const tarball = resolve(outputRoot, packed.filename);
  const archive = readFileSync(tarball);
  const sha512Hex = digest("sha512", archive);
  const metadata: ArtifactMetadata = {
    schemaVersion: 1,
    package: packed.name,
    version: packed.version,
    filename: packed.filename,
    tarball,
    sha512: `sha512:${sha512Hex}`,
    integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    inventory: `sha256:${digest("sha256", canonicalInventory(packed.files))}`,
    files: [...packed.files].sort((left, right) => left.path.localeCompare(right.path)),
  };
  writeFileSync(
    join(outputRoot, `${basename(packed.filename, ".tgz")}.artifact.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return metadata;
};

interface Arguments {
  readonly packageKey: PackageKey;
  readonly output: string;
  readonly githubOutput?: string;
}

const valueAfter = (arguments_: readonly string[], name: string): string | undefined => {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
};

const parseArguments = (arguments_: readonly string[]): Arguments => {
  const packageKey = valueAfter(arguments_, "--package");
  const output = valueAfter(arguments_, "--output");
  const githubOutput = valueAfter(arguments_, "--github-output");
  if (packageKey !== "aifsd" && packageKey !== "llm-core" && packageKey !== "strict-json") {
    throw new TypeError("Expected --package aifsd, llm-core or strict-json");
  }
  if (!output) throw new TypeError("Expected --output path");
  return {
    packageKey,
    output,
    ...(githubOutput ? { githubOutput } : {}),
  };
};

if (import.meta.main) {
  try {
    const root = resolve(import.meta.dir, "../..");
    const arguments_ = parseArguments(process.argv.slice(2));
    const outputRoot = resolve(arguments_.output);
    const metadata = prepareArtifact(
      join(root, packageDirectories[arguments_.packageKey]),
      outputRoot,
    );
    const metadataPath = join(outputRoot, `${basename(metadata.filename, ".tgz")}.artifact.json`);
    if (arguments_.githubOutput) {
      writeFileSync(
        arguments_.githubOutput,
        `tarball=${metadata.tarball}\nmetadata=${metadataPath}\nsha512=${metadata.sha512}\ninventory=${metadata.inventory}\n`,
        { flag: "a" },
      );
    }
    console.log(
      JSON.stringify(
        {
          ...metadata,
          files: `${metadata.files.length} entries recorded in ${metadataPath}`,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
