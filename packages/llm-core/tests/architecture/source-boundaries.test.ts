import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const packageRoot = resolve(import.meta.dir, "../..");
const sourceRoot = resolve(packageRoot, "src");
const testRoot = resolve(packageRoot, "tests");
const adapterRoot = resolve(sourceRoot, "adapters");

const walkTypeScript = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walkTypeScript(path) : path.endsWith(".ts") ? [path] : [];
  });

const legacyRoots = ["src/recipes", "src/adapters/types", "src/adapters/primitives"] as const;

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

const relativePath = (root: string, absolute: string): string =>
  relative(root, absolute).split(sep).join("/");

const sourcePath = (absolute: string): string => relativePath(sourceRoot, absolute);

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const testFilenameStem = (basename: string): string => {
  const stem = basename.slice(0, -".ts".length);
  if (stem.endsWith(".test")) return stem.slice(0, -".test".length);
  if (stem.endsWith(".fixture")) return stem.slice(0, -".fixture".length);
  return stem;
};

// Add an exact path case returning its independently owned reason when a real
// production boundary earns additional depth. There are no current exceptions.
const sourceDepthExceptionReason = (_path: string): string | undefined => undefined;

// Add an exact first-level adapter owner and independently owned reason only
// when a multi-file integration intentionally exposes no owner-level front.
// There are no current exceptions.
const adapterFrontExceptionReason = (_owner: string): string | undefined => undefined;

const indexFronts = new Map([
  ["adapters/ai-sdk/index.ts", "published ./adapters/ai-sdk front"],
  ["adapters/ai-sdk-ui/index.ts", "published ./adapters/ai-sdk-ui front"],
  ["adapters/assistant-ui/index.ts", "published ./adapters/assistant-ui front"],
  ["adapters/nlux-ui/index.ts", "published ./adapters/nlux-ui front"],
  ["adapters/openai-chatkit/index.ts", "published ./adapters/openai-chatkit front"],
  ["agent/index.ts", "published ./agent front"],
  ["control/index.ts", "published ./control front"],
  ["conversation/index.ts", "published ./conversation front"],
  [
    "functional/index.ts",
    "legacy package front retained only until architecture-legacy-functional-removal",
  ],
  ["interaction/index.ts", "published ./interaction front"],
  ["specifications/index.ts", "published ./specifications front"],
  ["workflow/index.ts", "published ./workflow front"],
]);

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
  // One exhaustive scan keeps path naming and owner-front diagnostics atomic.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  test("uses shallow, descriptive paths and explicit owner fronts", () => {
    const violations: string[] = [];
    for (const [label, root] of [
      ["src", sourceRoot],
      ["tests", testRoot],
    ] as const) {
      for (const file of walkTypeScript(root)) {
        const path = relativePath(root, file);
        const segments = path.split("/");
        const basename = segments.at(-1)!;
        const stem = label === "tests" ? testFilenameStem(basename) : basename.slice(0, -3);
        const governedPath = `${label}/${path}`;

        for (const directory of segments.slice(0, -1)) {
          if (!kebabCase.test(directory)) {
            violations.push(`${governedPath}: directory segment ${directory} must be kebab-case`);
          }
        }
        if (!kebabCase.test(stem)) {
          violations.push(`${governedPath}: filename must be kebab-case with a supported suffix`);
        }
        if (/^(?:common|helpers|misc|shared|utils)$/.test(stem)) {
          violations.push(`${governedPath}: vague basename requires a descriptive owned concept`);
        }

        if (label === "tests") continue;
        if (segments.length > 3 && sourceDepthExceptionReason(path) === undefined) {
          violations.push(`${governedPath}: production path exceeds src/<layer>/<owner>/<file>`);
        }
        if (basename === "index.ts" && !indexFronts.has(path)) {
          violations.push(
            `${governedPath}: index.ts is reserved for package or stable subpath fronts`,
          );
        }
      }
    }

    for (const entry of readdirSync(adapterRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const ownerRoot = resolve(adapterRoot, entry.name);
      if (walkTypeScript(ownerRoot).length < 2) continue;
      const hasFront = ["public.ts", "index.ts"].some((front) =>
        existsSync(resolve(ownerRoot, front)),
      );
      if (!hasFront && adapterFrontExceptionReason(entry.name) === undefined) {
        violations.push(
          `src/adapters/${entry.name}: multi-file adapter owner requires public.ts or index.ts`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

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
        if (feature && /^(?:application|composition|adapters)\//.test(imported)) {
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
