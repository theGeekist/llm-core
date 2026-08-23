import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { boundedResponseBytes } from "./release-history/bounded-response";

type PublishedPackageKey = "llm-core" | "pipeline" | "strict-json";

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly name: string;
  readonly version: string;
}

interface PublishedMetadata {
  readonly version?: unknown;
  readonly dist?: { readonly integrity?: unknown; readonly tarball?: unknown };
  readonly gitHead?: unknown;
}

const root = resolve(import.meta.dir, "..");
const readManifest = (path: string): PackageManifest =>
  JSON.parse(readFileSync(resolve(root, path), "utf8")) as PackageManifest;

export const registryIntegrity = (archive: Uint8Array): string =>
  `sha512-${createHash("sha512").update(archive).digest("base64")}`;

export const verifyPublishedArchive = (
  archive: Uint8Array,
  integrity: unknown,
  coordinate: string,
): void => {
  if (typeof integrity !== "string" || registryIntegrity(archive) !== integrity) {
    throw new Error(`${coordinate} downloaded bytes do not match registry integrity.`);
  }
};

const packageCoordinate = (key: PublishedPackageKey): string => {
  const strictJson = readManifest("packages/strict-json/package.json");
  const llmCore = readManifest("packages/llm-core/package.json");
  const aifsd = readManifest("packages/aifsd/package.json");
  if (llmCore.dependencies?.[strictJson.name] !== strictJson.version) {
    throw new Error(`${llmCore.name} must depend on ${strictJson.name} at ${strictJson.version}.`);
  }
  if (
    aifsd.dependencies?.[llmCore.name] !== llmCore.version ||
    aifsd.dependencies?.[strictJson.name] !== strictJson.version
  ) {
    throw new Error(`${aifsd.name} must bind the exact llm-core and strict-json candidates.`);
  }
  if (key === "strict-json") return `${strictJson.name}@${strictJson.version}`;
  if (key === "llm-core") return `${llmCore.name}@${llmCore.version}`;
  const pipelineVersion = aifsd.dependencies?.["@wpkernel/pipeline"];
  if (!pipelineVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pipelineVersion)) {
    throw new Error("AIFSD must bind an exact @wpkernel/pipeline version.");
  }
  return `@wpkernel/pipeline@${pipelineVersion}`;
};

const valueAfter = (arguments_: readonly string[], name: string): string | undefined => {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
};

if (import.meta.main) {
  try {
    const arguments_ = process.argv.slice(2);
    const key = valueAfter(arguments_, "--package");
    const output = valueAfter(arguments_, "--output");
    const githubOutput = valueAfter(arguments_, "--github-output");
    if (key !== "strict-json" && key !== "llm-core" && key !== "pipeline") {
      throw new TypeError("Expected --package strict-json, llm-core or pipeline");
    }
    if (!output) throw new TypeError("Expected --output path");
    if (arguments_.includes("--github-output") && !githubOutput) {
      throw new TypeError("Expected a path after --github-output");
    }

    const coordinate = packageCoordinate(key);
    const result = Bun.spawnSync(
      ["npm", "view", coordinate, "version", "dist", "gitHead", "--json"],
      {
        stderr: "pipe",
        stdout: "pipe",
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    if (result.exitCode !== 0) throw new Error(`${coordinate} must already be published.`);
    const published = JSON.parse(result.stdout.toString()) as PublishedMetadata;
    const expectedVersion = coordinate.slice(coordinate.lastIndexOf("@") + 1);
    if (published.version !== expectedVersion) {
      throw new Error(`Registry returned an unexpected version for ${coordinate}.`);
    }
    if (
      typeof published.dist?.tarball !== "string" ||
      !published.dist.tarball.startsWith("https://registry.npmjs.org/")
    ) {
      throw new Error(`${coordinate} lacks a canonical registry tarball.`);
    }
    if (key !== "pipeline" && typeof published.gitHead !== "string") {
      throw new Error(`${coordinate} lacks release gitHead metadata.`);
    }
    const archive = await boundedResponseBytes(published.dist.tarball, {
      label: `${coordinate} archive download`,
      limit: 100 * 1024 * 1024,
    });
    verifyPublishedArchive(archive, published.dist.integrity, coordinate);
    const resolvedOutput = resolve(output);
    mkdirSync(dirname(resolvedOutput), { recursive: true });
    writeFileSync(resolvedOutput, archive);
    if (githubOutput) {
      writeFileSync(
        githubOutput,
        `tarball=${resolvedOutput}\nintegrity=${published.dist.integrity}\ngit_head=${String(published.gitHead ?? "")}\n`,
        { flag: "a" },
      );
    }
    console.log(`Downloaded ${coordinate} from ${published.dist.tarball}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
