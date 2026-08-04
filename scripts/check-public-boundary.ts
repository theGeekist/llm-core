import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export interface PublicBoundaryViolation {
  readonly path: string;
  readonly reason: string;
}

interface BoundaryRule {
  readonly reason: string;
  readonly rejects: (path: string) => boolean;
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
    reason: "root agent guidance is local workspace state",
    rejects: (path) => path === "AGENTS.md",
  },
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

export const publicBoundaryViolations = (
  trackedPaths: readonly string[],
): readonly PublicBoundaryViolation[] =>
  trackedPaths.flatMap((path) => {
    const rule = rules.find(({ rejects }) => rejects(path));
    return rule === undefined ? [] : [{ path, reason: rule.reason }];
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
  const violations = publicBoundaryViolations(gitTrackedPaths(workspaceRoot));
  if (violations.length > 0) {
    console.error("Private workspace material is tracked by the public repository:");
    for (const violation of violations) {
      console.error(`- ${violation.path}: ${violation.reason}`);
    }
    process.exit(1);
  }
  console.log("Verified the tracked public repository boundary.");
}
