import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EXAMPLES_DIR = "../../../examples";
const CORE_PKG = "@geekist/llm-core";
const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

type PackageJson = Record<string, unknown>;

type Match = {
  file: string;
  field: string;
  version: string | null;
};

const readCoreVersion = (deps: Record<string, unknown>) => {
  const value = deps[CORE_PKG];
  return typeof value === "string" ? value : null;
};

const readPackageJson = (filePath: string): PackageJson => {
  try {
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as PackageJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${filePath}: ${message}`);
  }
};

const readDependencyField = (pkg: PackageJson, field: string) => {
  const value = pkg[field];
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
};

const hasCoreDependency = (pkg: PackageJson, field: string) => {
  const deps = readDependencyField(pkg, field);
  if (!deps) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(deps, CORE_PKG);
};

const isAllowedCoreVersion = (version: string | null) => {
  if (!version) {
    return false;
  }
  return version.startsWith("workspace:");
};

const collectMatches = (pkg: PackageJson, filePath: string) => {
  const matches: Match[] = [];
  for (const field of DEP_FIELDS) {
    if (hasCoreDependency(pkg, field)) {
      const deps = readDependencyField(pkg, field);
      const version = deps ? readCoreVersion(deps) : null;
      if (!isAllowedCoreVersion(version)) {
        matches.push({ file: filePath, field, version });
      }
    }
  }
  return matches;
};

const collectPackageJsons = (rootDir: string): string[] => {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules") {
      continue;
    }
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectPackageJsons(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === "package.json") {
      results.push(fullPath);
    }
  }
  return results;
};

const formatMatch = (match: Match) => {
  const suffix = match.version ? ` = ${match.version}` : "";
  return `${match.file} (${match.field}${suffix})`;
};

const runCheck = (): boolean => {
  const rootPath = join(process.cwd(), EXAMPLES_DIR);
  let packageFiles: string[] = [];
  try {
    packageFiles = collectPackageJsons(rootPath);
  } catch {
    return true;
  }

  const offenders: Match[] = [];
  for (const filePath of packageFiles) {
    try {
      const pkg = readPackageJson(filePath);
      offenders.push(...collectMatches(pkg, filePath));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  if (offenders.length === 0) {
    return true;
  }

  console.error(`Use workspace:* for ${CORE_PKG} in examples to avoid recursive installs:`);
  for (const offender of offenders) {
    console.error(`- ${formatMatch(offender)}`);
  }
  return false;
};

const ok = runCheck();
if (!ok) {
  process.exitCode = 1;
}
