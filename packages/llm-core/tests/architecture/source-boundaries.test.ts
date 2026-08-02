import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const packageRoot = resolve(import.meta.dir, "../..");
const sourceRoot = resolve(packageRoot, "src");

const walkTypeScript = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walkTypeScript(path) : path.endsWith(".ts") ? [path] : [];
  });

const legacyRoots = [
  "src/recipes",
  "src/adapters/types",
  "src/adapters/langchain",
  "src/adapters/llamaindex",
  "src/adapters/primitives",
] as const;

const legacyFiles = [
  "src/adapters/index.ts",
  "src/adapters/types.ts",
  "src/adapters/bundle.ts",
  "src/adapters/registry.ts",
  "src/adapters/registration.ts",
  "src/adapters/requirements.ts",
  "src/adapters/model-selection.ts",
  "src/shared/diagnostics.ts",
  "src/shared/reporting.ts",
  "src/shared/tool-execution.ts",
  "src/shared/types.ts",
] as const;

const importSpecifiers = (source: string): string[] => {
  const matches = source.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g);
  return [...matches].map((match) => match[1]!);
};

const sourcePath = (absolute: string): string =>
  relative(sourceRoot, absolute).split(sep).join("/");

const resolveInternalImport = (file: string, specifier: string): string | null => {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(file), specifier);
  for (const candidate of [base, `${base}.ts`, resolve(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return base;
};

const isPublicFront = (path: string): boolean =>
  path.endsWith("/public.ts") || path.endsWith("/runtime.ts") || path.endsWith("/index.ts");

const isApplicationFeatureFront = (path: string): boolean =>
  isPublicFront(path) || path.endsWith("/orchestration.ts");

describe("architecture v2 source boundaries", () => {
  test("removes the adapter-owned domain and legacy orchestration authorities", () => {
    for (const path of legacyRoots) {
      const absolute = resolve(packageRoot, path);
      expect(!existsSync(absolute) || walkTypeScript(absolute).length === 0).toBe(true);
    }
    for (const path of legacyFiles) {
      expect(existsSync(resolve(packageRoot, path))).toBe(false);
    }
  });

  test("contains no compatibility vocabulary from the deleted public surface", () => {
    const forbidden =
      /\b(?:AdapterBundle|AdapterCallContext|AgentRuntime|createAgentRuntime|EventStream|InterruptStrategy|RecipeContract|RecipeHandle|RecipeName|OutcomeType)\b|\bartefact\b/;
    const offenders = walkTypeScript(sourceRoot)
      .filter((file) => forbidden.test(readFileSync(file, "utf8")))
      .map(sourcePath);
    expect(offenders).toEqual([]);
  });

  test("keeps adapters out of private application modules", () => {
    const adapterRoot = resolve(sourceRoot, "adapters");
    const violations = walkTypeScript(adapterRoot).flatMap((file) =>
      importSpecifiers(readFileSync(file, "utf8")).flatMap((specifier) => {
        const target = resolveInternalImport(file, specifier);
        if (!target || !target.startsWith(sourceRoot)) return [];
        const imported = sourcePath(target);
        return imported.startsWith("application/") && !imported.endsWith("/public.ts")
          ? [`${sourcePath(file)} -> ${imported}`]
          : [];
      }),
    );
    expect(violations).toEqual([]);
  });

  // One exhaustive scan keeps the dependency rules and their diagnostics atomic.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  test("keeps contracts dependency-light and cross-slice imports on public fronts", () => {
    const violations: string[] = [];
    for (const file of walkTypeScript(sourceRoot)) {
      const owner = sourcePath(file);
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        const target = resolveInternalImport(file, specifier);
        if (!target || !target.startsWith(sourceRoot)) continue;
        const imported = sourcePath(target);

        if (
          owner.startsWith("contracts/") &&
          /^(?:features|application|composition|adapters)\//.test(imported)
        ) {
          violations.push(`${owner} -> ${imported}`);
          continue;
        }

        const feature = owner.match(/^features\/([^/]+)\//)?.[1];
        const importedFeature = imported.match(/^features\/([^/]+)\//)?.[1];
        if (feature && importedFeature && feature !== importedFeature && !isPublicFront(imported)) {
          violations.push(`${owner} -> ${imported}`);
          continue;
        }
        const qualifiedToolRuntimeAggregation =
          owner === "features/tooling/runtime.ts" &&
          imported === "application/tool-execution/public.ts";
        if (
          feature &&
          /^(?:application|composition|adapters)\//.test(imported) &&
          !qualifiedToolRuntimeAggregation
        ) {
          violations.push(`${owner} -> ${imported}`);
          continue;
        }

        if (
          owner.startsWith("application/") &&
          importedFeature &&
          !isApplicationFeatureFront(imported)
        ) {
          violations.push(`${owner} -> ${imported}`);
          continue;
        }
        if (owner.startsWith("application/") && /^(?:composition|adapters)\//.test(imported)) {
          violations.push(`${owner} -> ${imported}`);
          continue;
        }

        if (
          owner.startsWith("adapters/") &&
          ((imported.startsWith("features/") && !isPublicFront(imported)) ||
            (imported.startsWith("application/") && !imported.endsWith("/public.ts")))
        ) {
          violations.push(`${owner} -> ${imported}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
