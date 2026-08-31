import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const packageRoot = resolve(import.meta.dir, "../..");
const sourceRoot = resolve(packageRoot, "src");
const testRoot = resolve(packageRoot, "tests");
const adapterRoot = resolve(sourceRoot, "adapters");

const walkTypeScript = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && entry.name === "node_modules") return [];
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
// production boundary earns additional depth.
const sourceDepthExceptionReason = (path: string): string | undefined =>
  /^adapters\/protocols\/(?:a2a|mcp)\/[^/]+\.ts$/.test(path)
    ? "independently qualified protocol owner below the shared publication boundary"
    : undefined;

// Add an exact first-level adapter owner and independently owned reason only
// when a multi-file integration intentionally exposes no owner-level front.
const adapterFrontExceptionReason = (owner: string): string | undefined =>
  owner === "protocols" ? "A2A and MCP own distinct published child fronts" : undefined;

const indexFronts = new Map([
  ["adapters/ai-sdk/index.ts", "published ./adapters/ai-sdk front"],
  ["adapters/ai-sdk-ui/index.ts", "published ./adapters/ai-sdk-ui front"],
  ["adapters/assistant-ui/index.ts", "published ./adapters/assistant-ui front"],
  ["adapters/langchain/index.ts", "published ./adapters/langchain front"],
  ["adapters/llamaindex/index.ts", "published ./adapters/llamaindex front"],
  ["adapters/nlux-ui/index.ts", "published ./adapters/nlux-ui front"],
  ["adapters/openai-chatkit/index.ts", "published ./adapters/openai-chatkit front"],
  ["adapters/protocols/a2a/index.ts", "published ./a2a front"],
  ["adapters/protocols/mcp/index.ts", "published ./mcp front"],
  ["agent/index.ts", "published ./agent front"],
  ["control/index.ts", "published ./control front"],
  ["conversation/index.ts", "published ./conversation front"],
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

const pathViolations = (label: "src" | "tests", root: string, file: string): string[] => {
  const path = relativePath(root, file);
  const segments = path.split("/");
  const basename = segments.at(-1)!;
  const stem = label === "tests" ? testFilenameStem(basename) : basename.slice(0, -3);
  const governedPath = `${label}/${path}`;
  const violations = segments
    .slice(0, -1)
    .filter((directory) => !kebabCase.test(directory))
    .map((directory) => `${governedPath}: directory segment ${directory} must be kebab-case`);

  if (!kebabCase.test(stem)) {
    violations.push(`${governedPath}: filename must be kebab-case with a supported suffix`);
  }
  if (/^(?:common|helpers|misc|shared|utils)$/.test(stem)) {
    violations.push(`${governedPath}: vague basename requires a descriptive owned concept`);
  }
  if (label === "tests") return violations;
  if (segments.length > 3 && sourceDepthExceptionReason(path) === undefined) {
    violations.push(`${governedPath}: production path exceeds src/<layer>/<owner>/<file>`);
  }
  if (basename === "index.ts" && !indexFronts.has(path)) {
    violations.push(`${governedPath}: index.ts is reserved for package or stable subpath fronts`);
  }
  return violations;
};

const adapterOwnerViolation = (entry: {
  readonly isDirectory: () => boolean;
  readonly name: string;
}): string[] => {
  if (!entry.isDirectory()) return [];
  const ownerRoot = resolve(adapterRoot, entry.name);
  if (walkTypeScript(ownerRoot).length < 2) return [];
  const hasFront = ["public.ts", "index.ts"].some((front) => existsSync(resolve(ownerRoot, front)));
  return !hasFront && adapterFrontExceptionReason(entry.name) === undefined
    ? [`src/adapters/${entry.name}: multi-file adapter owner requires public.ts or index.ts`]
    : [];
};

const privateApplicationImportViolation = (file: string, specifier: string): string[] => {
  const target = resolveInternalImport(file, specifier);
  if (!target || !target.startsWith(sourceRoot)) return [];
  const imported = sourcePath(target);
  return imported.startsWith("application/") && !imported.endsWith("/public.ts")
    ? [`${sourcePath(file)} -> ${imported}`]
    : [];
};

const privateApplicationViolationsForFile = (file: string): string[] =>
  importSpecifiers(readFileSync(file, "utf8")).flatMap((specifier) =>
    privateApplicationImportViolation(file, specifier),
  );

const isContractDependencyViolation = (owner: string, imported: string): boolean =>
  owner.startsWith("contracts/") &&
  /^(?:features|application|composition|adapters)\//.test(imported);

const isFeatureDependencyViolation = (owner: string, imported: string): boolean => {
  const feature = owner.match(/^features\/([^/]+)\//)?.[1];
  if (!feature) return false;
  const importedFeature = imported.match(/^features\/([^/]+)\//)?.[1];
  return (
    (importedFeature !== undefined && feature !== importedFeature && !isPublicFront(imported)) ||
    /^(?:application|composition|adapters)\//.test(imported)
  );
};

const isApplicationDependencyViolation = (owner: string, imported: string): boolean => {
  if (!owner.startsWith("application/")) return false;
  const importedFeature = imported.match(/^features\/([^/]+)\//)?.[1];
  return (
    (importedFeature !== undefined && !isApplicationFeatureFront(imported)) ||
    /^(?:composition|adapters)\//.test(imported)
  );
};

const isAdapterDependencyViolation = (owner: string, imported: string): boolean =>
  owner.startsWith("adapters/") &&
  ((imported.startsWith("features/") && !isPublicFront(imported)) ||
    (imported.startsWith("application/") && !imported.endsWith("/public.ts")));

const dependencyViolation = (owner: string, imported: string): string[] => {
  const violates = [
    isContractDependencyViolation,
    isFeatureDependencyViolation,
    isApplicationDependencyViolation,
    isAdapterDependencyViolation,
  ].some((predicate) => predicate(owner, imported));
  return violates ? [`${owner} -> ${imported}`] : [];
};

const sourceDependencyViolations = (file: string): string[] => {
  const owner = sourcePath(file);
  return importSpecifiers(readFileSync(file, "utf8")).flatMap((specifier) => {
    const target = resolveInternalImport(file, specifier);
    return !target || !target.startsWith(sourceRoot)
      ? []
      : dependencyViolation(owner, sourcePath(target));
  });
};

describe("architecture v2 source boundaries", () => {
  test("uses shallow, descriptive paths and explicit owner fronts", () => {
    const violations = [
      ...walkTypeScript(sourceRoot).flatMap((file) => pathViolations("src", sourceRoot, file)),
      ...walkTypeScript(testRoot).flatMap((file) => pathViolations("tests", testRoot, file)),
      ...readdirSync(adapterRoot, { withFileTypes: true }).flatMap(adapterOwnerViolation),
    ];
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
    const violations = walkTypeScript(adapterRoot).flatMap(privateApplicationViolationsForFile);
    expect(violations).toEqual([]);
  });

  test("keeps contracts dependency-light and cross-slice imports on public fronts", () => {
    const violations = walkTypeScript(sourceRoot).flatMap(sourceDependencyViolations);
    expect(violations).toEqual([]);
  });
});
