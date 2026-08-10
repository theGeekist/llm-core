import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type PackageKey = "aifsd" | "llm-core" | "strict-json";

interface ReleasePackage {
  readonly directory: string;
  readonly name: string;
  readonly tagPrefix: string;
}

interface VersionCheckOptions {
  readonly packageKey: PackageKey;
  readonly tag?: string;
  readonly allowUnreleased: boolean;
  readonly distTag?: string;
}

const releasePackages: Readonly<Record<PackageKey, ReleasePackage>> = {
  aifsd: {
    directory: "packages/aifsd",
    name: "@aifsd/sdk",
    tagPrefix: "aifsd-v",
  },
  "llm-core": {
    directory: "packages/llm-core",
    name: "@geekist/llm-core",
    tagPrefix: "v",
  },
  "strict-json": {
    directory: "packages/strict-json",
    name: "@aifsd/strict-json",
    tagPrefix: "strict-json-v",
  },
};

const validIdentifiers = (value: string): boolean =>
  value.split(".").every((identifier) => identifier !== "" && /^[0-9A-Za-z-]+$/.test(identifier));

export const isExactSemver = (value: string): boolean => {
  const buildParts = value.split("+");
  if (buildParts.length > 2 || (buildParts[1] !== undefined && !validIdentifiers(buildParts[1]))) {
    return false;
  }
  const versionParts = (buildParts[0] ?? "").split("-");
  if (
    versionParts.length > 2 ||
    (versionParts[1] !== undefined && !validIdentifiers(versionParts[1]))
  ) {
    return false;
  }
  const numericParts = (versionParts[0] ?? "").split(".");
  return (
    numericParts.length === 3 &&
    numericParts.every((part) => part === "0" || /^[1-9]\d*$/.test(part))
  );
};

export const npmDistTag = (version: string): string => {
  if (!isExactSemver(version)) throw new TypeError(`Invalid semantic version: ${version}`);
  const prerelease = version.split("+")[0]?.split("-")[1];
  return prerelease ? "next" : "latest";
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

export const validateReleaseVersion = (root: string, options: VersionCheckOptions): string[] => {
  const releasePackage = releasePackages[options.packageKey];
  const packageRoot = join(root, releasePackage.directory);
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    readonly name?: unknown;
    readonly version?: unknown;
    readonly private?: unknown;
  };
  const changelog = readFileSync(join(packageRoot, "CHANGELOG.md"), "utf8");
  const errors: string[] = [];

  if (manifest.name !== releasePackage.name) {
    errors.push(`manifest name must be ${releasePackage.name}`);
  }
  if (typeof manifest.version !== "string" || !isExactSemver(manifest.version)) {
    errors.push("manifest version must be an exact semantic version");
    return errors;
  }
  if (manifest.private === true) errors.push(`${releasePackage.name} must not be private`);

  const version = manifest.version;
  const releaseHeading = new RegExp(
    `^## \\[${escapeRegExp(version)}\\] - (\\d{4}-\\d{2}-\\d{2})$`,
    "m",
  ).exec(changelog);

  if (options.tag !== undefined) {
    const expectedTag = `${releasePackage.tagPrefix}${version}`;
    if (options.tag !== expectedTag) {
      errors.push(`tag ${options.tag} must exactly match ${expectedTag}`);
    }
    if (!releaseHeading || !validDate(releaseHeading[1] ?? "")) {
      errors.push(`CHANGELOG.md must contain a dated ${version} release heading`);
    }
    if (options.distTag !== undefined && options.distTag !== npmDistTag(version)) {
      errors.push(`npm dist-tag ${options.distTag} must be ${npmDistTag(version)} for ${version}`);
    }
    return errors;
  }

  if (releaseHeading && validDate(releaseHeading[1] ?? "")) return errors;
  const unreleasedTarget = new RegExp(
    `^## \\[Unreleased\\][\\s\\S]*?^Target version: ${escapeRegExp(version)}\\.$`,
    "m",
  );
  if (!options.allowUnreleased || !unreleasedTarget.test(changelog)) {
    errors.push(
      `CHANGELOG.md must contain a dated ${version} heading or an Unreleased target for ${version}`,
    );
  }
  return errors;
};

const parseArguments = (arguments_: readonly string[]): VersionCheckOptions => {
  const packageIndex = arguments_.indexOf("--package");
  const packageKey = arguments_[packageIndex + 1];
  if (
    packageIndex < 0 ||
    (packageKey !== "aifsd" && packageKey !== "llm-core" && packageKey !== "strict-json")
  ) {
    throw new TypeError("Expected --package aifsd, llm-core or strict-json");
  }
  const tagIndex = arguments_.indexOf("--tag");
  const tag = tagIndex < 0 ? undefined : arguments_[tagIndex + 1];
  if (tagIndex >= 0 && (!tag || tag.startsWith("-"))) {
    throw new TypeError("Expected a tag value after --tag");
  }
  const distTagIndex = arguments_.indexOf("--dist-tag");
  const distTag = distTagIndex < 0 ? undefined : arguments_[distTagIndex + 1];
  if (distTagIndex >= 0 && (!distTag || !/^[a-z][a-z0-9-]*$/.test(distTag))) {
    throw new TypeError("Expected a canonical npm tag after --dist-tag");
  }
  return {
    packageKey,
    ...(tag === undefined ? {} : { tag }),
    ...(distTag === undefined ? {} : { distTag }),
    allowUnreleased: arguments_.includes("--allow-unreleased"),
  };
};

if (import.meta.main) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const errors = validateReleaseVersion(resolve(import.meta.dir, ".."), options);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    console.log(`Version and changelog are coherent for ${options.packageKey}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
