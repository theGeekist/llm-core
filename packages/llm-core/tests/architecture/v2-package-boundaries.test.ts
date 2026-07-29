import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const sourceRoot = resolve(root, "src");
const scannedRoots = [
  "contracts",
  "features",
  "application",
  "composition",
  "adapters/providers",
  "adapters/ui",
].map((path) => resolve(sourceRoot, path));

const walk = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });

const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:from|import)\s*(?:\([^)]*)?["']([^"']+)["']/g)].map((match) => match[1]!);

describe("v2 package boundaries", () => {
  test("cross-feature imports use public fronts", () => {
    const violations: string[] = [];
    for (const file of scannedRoots.flatMap(walk)) {
      const owner = relative(sourceRoot, file).split("/").slice(0, 2).join("/");
      for (const specifier of importsOf(readFileSync(file, "utf8"))) {
        if (!specifier.includes("features/")) continue;
        const target = relative(sourceRoot, resolve(file, "..", specifier));
        const targetOwner = target.split("/").slice(0, 2).join("/");
        if (owner !== targetOwner && !target.endsWith("/public")) {
          violations.push(`${relative(root, file)} -> ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("new architecture fronts do not depend on adapter-owned contracts", () => {
    const violations = scannedRoots
      .flatMap(walk)
      .filter((file) => /#adapters(?:\/types)?|adapters\/types/.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));
    expect(violations).toEqual([]);
  });
});
