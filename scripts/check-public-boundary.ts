import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface PublicBoundaryViolation {
  readonly path: string;
  readonly reason: string;
}

interface BoundaryRule {
  readonly reason: string;
  readonly rejects: (path: string) => boolean;
}

export interface PublicProjection {
  readonly version: 1;
  readonly aifsdExactPaths: readonly string[];
  readonly aifsdCodeRoots: readonly string[];
  readonly aifsdPublicDocuments: readonly string[];
}

const isAtOrBelow = (root: string, path: string): boolean =>
  path === root || path.startsWith(`${root}/`);

const isArchitectureValidator = (path: string): boolean => {
  const root = "packages/aifsd/scripts/";
  if (!path.startsWith(root)) return false;
  const filename = path.slice(root.length);
  const extension = filename.slice(filename.lastIndexOf(".") + 1);
  return (
    filename.startsWith("validate-architecture") && ["cjs", "js", "mjs", "ts"].includes(extension)
  );
};

const isAifsdRootAuthority = (path: string): boolean => {
  const root = "packages/aifsd/";
  if (!path.startsWith(root)) return false;
  const filename = path.slice(root.length);
  if (filename.includes("/")) return false;
  if (["STATUS.md", "ROADMAP.md", "COORDINATION.md"].includes(filename)) return true;
  if (!filename.startsWith("ADR-") || !filename.endsWith(".md")) return false;
  const sequence = filename.slice("ADR-".length, filename.indexOf("-", "ADR-".length));
  return (
    sequence.length > 0 && [...sequence].every((character) => character >= "0" && character <= "9")
  );
};

const rules: readonly BoundaryRule[] = [
  {
    reason: "AIFSD private documentation is an optional local mount",
    rejects: (path) => isAtOrBelow("packages/aifsd/docs", path),
  },
  {
    reason: "AIFSD architecture validators belong with the private documentation authority",
    rejects: isArchitectureValidator,
  },
  {
    reason: "AIFSD private architecture authority must not be tracked in the public package",
    rejects: (path) =>
      isAtOrBelow("packages/aifsd/architecture", path) ||
      isAtOrBelow("packages/aifsd/final-architecture", path) ||
      isAtOrBelow("packages/aifsd/internal/architecture", path) ||
      isAifsdRootAuthority(path),
  },
  {
    reason: "the private repository's physical product authority cannot be projected here",
    rejects: (path) => isAtOrBelow("product/aifsd", path),
  },
];

const validPath = (path: string): boolean =>
  path.length > 0 &&
  !path.startsWith("/") &&
  !path.endsWith("/") &&
  !path.includes("//") &&
  !path.split("/").some((segment) => segment === "." || segment === "..");

const validatePathList = (
  projection: Record<string, unknown>,
  key: keyof Omit<PublicProjection, "version">,
  accepts: (path: string) => boolean,
): readonly string[] => {
  const value = projection[key];
  if (!Array.isArray(value) || value.some((path) => typeof path !== "string")) {
    throw new Error(`${key} must be an array of paths`);
  }
  const paths = value as string[];
  if (paths.some((path) => !validPath(path) || !accepts(path))) {
    throw new Error(`${key} contains an invalid path`);
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error(`${key} must not contain duplicate paths`);
  }
  if ([...paths].sort().some((path, index) => path !== paths[index])) {
    throw new Error(`${key} must be sorted`);
  }
  return paths;
};

export const parsePublicProjection = (text: string): PublicProjection => {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("public projection must be an object");
  }
  const projection = value as Record<string, unknown>;
  const keys = ["version", "aifsdExactPaths", "aifsdCodeRoots", "aifsdPublicDocuments"];
  if (
    projection.version !== 1 ||
    Object.keys(projection).some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in projection))
  ) {
    throw new Error("public projection has an unsupported shape or version");
  }
  return {
    version: 1,
    aifsdExactPaths: validatePathList(
      projection,
      "aifsdExactPaths",
      (path) => path.startsWith("packages/aifsd/") && !path.includes("*"),
    ),
    aifsdCodeRoots: validatePathList(
      projection,
      "aifsdCodeRoots",
      (path) => path.startsWith("packages/aifsd/") && !path.includes("*"),
    ),
    aifsdPublicDocuments: validatePathList(
      projection,
      "aifsdPublicDocuments",
      (path) => path.startsWith("docs/aifsd/") && !path.includes("*"),
    ),
  };
};

const projectionViolation = (
  path: string,
  projection: PublicProjection,
): PublicBoundaryViolation | null => {
  if (isAtOrBelow("packages/aifsd", path)) {
    const allowed =
      projection.aifsdExactPaths.includes(path) ||
      projection.aifsdCodeRoots.some((root) => isAtOrBelow(root, path));
    return allowed ? null : { path, reason: "path is not declared in the public AIFSD projection" };
  }
  if (isAtOrBelow("docs/aifsd", path) && !projection.aifsdPublicDocuments.includes(path)) {
    return {
      path,
      reason: "document is not declared in the public AIFSD projection",
    };
  }
  return null;
};

export const publicBoundaryViolations = (
  trackedPaths: readonly string[],
  projection: PublicProjection,
): readonly PublicBoundaryViolation[] =>
  trackedPaths.flatMap((path) => {
    const rule = rules.find(({ rejects }) => rejects(path));
    if (rule !== undefined) return [{ path, reason: rule.reason }];
    const violation = projectionViolation(path, projection);
    return violation === null ? [] : [violation];
  });

export const gitTrackedPaths = (workspaceRoot: string): readonly string[] =>
  execFileSync("/usr/bin/git", ["ls-files", "-z"], {
    cwd: workspaceRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

if (import.meta.main) {
  const workspaceRoot = resolve(import.meta.dir, "..");
  const projection = parsePublicProjection(
    readFileSync(resolve(workspaceRoot, "scripts/public-projection.json"), "utf8"),
  );
  const violations = publicBoundaryViolations(gitTrackedPaths(workspaceRoot), projection);
  if (violations.length > 0) {
    console.error("Private workspace material is tracked by the public repository:");
    for (const violation of violations) {
      console.error(`- ${violation.path}: ${violation.reason}`);
    }
    process.exit(1);
  }
  console.log("Verified the tracked public repository boundary.");
}
