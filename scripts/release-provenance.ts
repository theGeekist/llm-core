import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";
import { validateReleaseReceipt } from "./release-provenance-receipt";

export { validateReleaseReceipt } from "./release-provenance-receipt";

export type PackageKey = "aifsd" | "llm-core" | "strict-json";

type JsonRecord = Readonly<Record<string, unknown>>;

interface PackageConfig {
  readonly directory: string;
  readonly name: string;
  readonly tagPrefix: string;
}

const packages: Readonly<Record<PackageKey, PackageConfig>> = {
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

const fragmentKeys = new Set([
  "schemaVersion",
  "id",
  "package",
  "tasks",
  "decisions",
  "releaseImpact",
  "summary",
  "affectedExports",
  "contributors",
  "assistance",
  "reason",
]);

const planKeys = new Set([
  "schemaVersion",
  "package",
  "version",
  "classification",
  "sourceSha",
  "releaseSha",
  "tag",
  "sourceTree",
  "releaseTree",
  "approvedMetadataPaths",
  "fragments",
  "dependencies",
  "digests",
  "toolchain",
  "supportDeclarations",
]);

const planFragmentKeys = new Set(["path", "blob"]);
const planDigestKeys = new Set(["manifest", "lockfile", "qualifierRegistry"]);
const planToolchainKeys = new Set(["bun", "node"]);
const supportDeclarationKeys = new Set(["surface", "window", "qualifier", "owner"]);

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: JsonRecord, allowed: ReadonlySet<string>, path: string): string[] =>
  Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${path} contains unknown key ${key}`);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === value && value.length > 0;

const stringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(nonEmptyString);

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

const sha = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{40}$/.test(value);

const shaOrSelf = (value: unknown): value is string => value === "SELF" || sha(value);

const digest = (value: unknown, algorithm?: "sha256" | "sha512"): value is string => {
  if (typeof value !== "string") return false;
  const match = /^sha(256|512):([0-9a-f]+)$/.exec(value);
  if (!match || (algorithm && `sha${match[1]}` !== algorithm)) return false;
  return match[2]?.length === (match[1] === "256" ? 64 : 128);
};

const canonicalRepositoryPath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value === posix.normalize(value) &&
  !value.startsWith("/") &&
  !value.startsWith("../") &&
  !value.includes("\\") &&
  !value.split("/").includes("..");

const validIdentifiers = (value: string): boolean =>
  value.split(".").every((identifier) => identifier !== "" && /^[0-9A-Za-z-]+$/.test(identifier));

const exactSemver = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
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

const validateStringArray = (
  value: unknown,
  path: string,
  options: { readonly nonEmpty?: boolean; readonly unique?: boolean } = {},
): string[] => {
  if (!stringArray(value)) return [`${path} must be an array of non-empty strings`];
  if (options.nonEmpty && value.length === 0) return [`${path} must not be empty`];
  if (options.unique && !unique(value)) return [`${path} must not contain duplicates`];
  return [];
};

const taskPath = (root: string, task: string): string | undefined => {
  const match = /^(llm-core|strict-json)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(task);
  return match
    ? join(root, "packages", match[1] ?? "", "docs/final-architecture/tasks", `${match[2]}.md`)
    : undefined;
};

const decisionPath = (root: string, decision: string): string | undefined => {
  const match = /^llm-core\/(ADR-\d{3})$/.exec(decision);
  const directory = join(root, "packages/llm-core/docs/final-architecture/decisions");
  return match
    ? readdirSync(directory)
        .filter((file) => file.startsWith(`${match[1]}-`) && file.endsWith(".md"))
        .map((file) => join(directory, file))[0]
    : undefined;
};

const validateAssistance = (value: unknown, path: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [`${path}.assistance must be an array`];
  return value.flatMap((entry, index) =>
    isRecord(entry) &&
    Object.keys(entry).every((key) => key === "system" || key === "role") &&
    nonEmptyString(entry.system) &&
    nonEmptyString(entry.role)
      ? []
      : [`${path}.assistance[${index}] must contain only system and role`],
  );
};

const validateReferences = (
  value: JsonRecord,
  root: string | undefined,
  path: string,
): string[] => {
  if (!root) return [];
  const taskErrors = Array.isArray(value.tasks)
    ? value.tasks.flatMap((task) => {
        const candidate = typeof task === "string" ? taskPath(root, task) : undefined;
        return candidate && existsSync(candidate)
          ? []
          : [`${path}.tasks references unknown task ${task}`];
      })
    : [];
  const decisionErrors = Array.isArray(value.decisions)
    ? value.decisions.flatMap((decision) => {
        const candidate = typeof decision === "string" ? decisionPath(root, decision) : undefined;
        return candidate && existsSync(candidate)
          ? []
          : [`${path}.decisions references unknown decision ${decision}`];
      })
    : [];
  return [...taskErrors, ...decisionErrors];
};

export const validateChangeFragment = (
  value: unknown,
  root?: string,
  path = "fragment",
): string[] => {
  if (!isRecord(value)) return [`${path} must be an object`];
  const errors = exactKeys(value, fragmentKeys, path);
  if (value.schemaVersion !== 1) errors.push(`${path}.schemaVersion must be 1`);
  if (!nonEmptyString(value.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)) {
    errors.push(`${path}.id must be canonical kebab-case`);
  }
  if (!Object.values(packages).some(({ name }) => name === value.package)) {
    errors.push(`${path}.package is unsupported`);
  }
  errors.push(
    ...validateStringArray(value.tasks, `${path}.tasks`, { nonEmpty: true, unique: true }),
  );
  errors.push(...validateStringArray(value.decisions, `${path}.decisions`, { unique: true }));
  if (!new Set(["major", "minor", "patch", "none"]).has(String(value.releaseImpact))) {
    errors.push(`${path}.releaseImpact is unsupported`);
  }
  if (!nonEmptyString(value.summary)) errors.push(`${path}.summary must be a non-empty string`);
  errors.push(
    ...validateStringArray(value.affectedExports, `${path}.affectedExports`, { unique: true }),
  );
  if (value.contributors !== undefined) {
    errors.push(
      ...validateStringArray(value.contributors, `${path}.contributors`, { unique: true }),
    );
  }
  errors.push(...validateAssistance(value.assistance, path));
  if (value.releaseImpact === "none" && !nonEmptyString(value.reason)) {
    errors.push(`${path}.reason is required when releaseImpact is none`);
  }
  errors.push(...validateReferences(value, root, path));
  return errors;
};

const validatePlanFragments = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return [`${path}.fragments must be a non-empty array`];
  }
  return value.flatMap((entry, index) => {
    const entryPath = `${path}.fragments[${index}]`;
    if (!isRecord(entry)) return [`${entryPath} must be an object`];
    const errors = exactKeys(entry, planFragmentKeys, entryPath);
    if (!canonicalRepositoryPath(entry.path)) {
      errors.push(`${entryPath}.path must be a canonical repository-relative path`);
    }
    if (!sha(entry.blob)) errors.push(`${entryPath}.blob must be a full Git blob SHA`);
    return errors;
  });
};

const validateSupportDeclarations = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value)) return [`${path}.supportDeclarations must be an array`];
  const surfaces = new Set<string>();
  return value.flatMap((entry, index) => {
    const entryPath = `${path}.supportDeclarations[${index}]`;
    if (!isRecord(entry)) return [`${entryPath} must be an object`];
    const errors = exactKeys(entry, supportDeclarationKeys, entryPath);
    for (const key of supportDeclarationKeys) {
      if (!nonEmptyString(entry[key]))
        errors.push(`${entryPath}.${key} must be a non-empty string`);
    }
    if (typeof entry.surface === "string") {
      if (surfaces.has(entry.surface)) errors.push(`${entryPath}.surface must be unique`);
      surfaces.add(entry.surface);
    }
    return errors;
  });
};

const validateDependencies = (
  value: unknown,
  path: string,
  packageConfig: PackageConfig | undefined,
): string[] => {
  const errors: string[] = [];
  if (
    !isRecord(value) ||
    Object.keys(value).some((name) => !nonEmptyString(name)) ||
    Object.values(value).some((item) => !exactSemver(item))
  ) {
    errors.push(`${path}.dependencies must map package names to exact semantic versions`);
  }
  if (
    packageConfig?.name === "@geekist/llm-core" &&
    (!isRecord(value) || !exactSemver(value["@aifsd/strict-json"]))
  ) {
    errors.push(`${path}.dependencies must bind @aifsd/strict-json exactly`);
  }
  if (
    packageConfig?.name === "@aifsd/sdk" &&
    (!isRecord(value) ||
      !exactSemver(value["@geekist/llm-core"]) ||
      !exactSemver(value["@aifsd/strict-json"]))
  ) {
    errors.push(`${path}.dependencies must bind @geekist/llm-core and @aifsd/strict-json exactly`);
  }
  return errors;
};

const validatePlanDigests = (
  value: unknown,
  path: string,
  packageConfig: PackageConfig | undefined,
): string[] => {
  if (!isRecord(value)) return [`${path}.digests must contain manifest and lockfile digests`];
  const errors = exactKeys(value, planDigestKeys, `${path}.digests`);
  if (!digest(value.manifest, "sha256") || !digest(value.lockfile, "sha256")) {
    errors.push(`${path}.digests must contain exact SHA-256 manifest and lockfile digests`);
  }
  if (
    (packageConfig?.name === "@geekist/llm-core" || packageConfig?.name === "@aifsd/sdk") &&
    !digest(value.qualifierRegistry, "sha256")
  ) {
    errors.push(`${path}.digests.qualifierRegistry must be an exact SHA-256 digest`);
  }
  return errors;
};

const validatePlanToolchain = (value: unknown, path: string): string[] => {
  if (!isRecord(value)) return [`${path}.toolchain must contain Bun and Node versions`];
  const errors = exactKeys(value, planToolchainKeys, `${path}.toolchain`);
  if (!exactSemver(value.bun) || !/^\d+(?:\.\d+){0,2}$/.test(String(value.node))) {
    errors.push(`${path}.toolchain must contain exact Bun and Node versions`);
  }
  return errors;
};

const validatePlanRecords = (
  value: JsonRecord,
  path: string,
  packageConfig: PackageConfig | undefined,
): string[] => [
  ...validateDependencies(value.dependencies, path, packageConfig),
  ...validatePlanDigests(value.digests, path, packageConfig),
  ...validatePlanToolchain(value.toolchain, path),
];

const validatePlanIdentity = (
  value: JsonRecord,
  path: string,
  packageConfig: PackageConfig | undefined,
): string[] => {
  const errors: string[] = [];
  if (value.schemaVersion !== 1) errors.push(`${path}.schemaVersion must be 1`);
  if (!packageConfig) errors.push(`${path}.package is unsupported`);
  if (!exactSemver(value.version)) errors.push(`${path}.version must be exact semantic version`);
  if (value.classification !== "current" && value.classification !== "historical-npm") {
    errors.push(`${path}.classification is unsupported`);
  }
  if (!sha(value.sourceSha)) errors.push(`${path}.sourceSha must be a full Git SHA`);
  if (!shaOrSelf(value.releaseSha))
    errors.push(`${path}.releaseSha must be SELF or a full Git SHA`);
  if (
    !packageConfig ||
    !exactSemver(value.version) ||
    value.tag !== `${packageConfig.tagPrefix}${value.version}`
  ) {
    errors.push(`${path}.tag must exactly match package and version`);
  }
  if (!sha(value.sourceTree)) errors.push(`${path}.sourceTree must be a full Git SHA`);
  if (!shaOrSelf(value.releaseTree))
    errors.push(`${path}.releaseTree must be SELF or a full Git SHA`);
  return errors;
};

const validateApprovedPaths = (value: unknown, path: string): string[] => {
  const errors = validateStringArray(value, `${path}.approvedMetadataPaths`, {
    nonEmpty: true,
    unique: true,
  });
  if (Array.isArray(value) && value.some((entry) => !canonicalRepositoryPath(entry))) {
    errors.push(`${path}.approvedMetadataPaths must contain canonical repository-relative paths`);
  }
  return errors;
};

const validateLocatedFragments = ({
  value,
  path,
  packageConfig,
  version,
}: {
  readonly value: unknown;
  readonly path: string;
  readonly packageConfig: PackageConfig | undefined;
  readonly version: unknown;
}): string[] => {
  const errors = validatePlanFragments(value, path);
  if (!Array.isArray(value) || !packageConfig || !exactSemver(version)) return errors;
  const expectedPrefix = `${packageConfig.directory}/changes/released/${version}/`;
  const outside = value.some(
    (fragment) =>
      isRecord(fragment) &&
      typeof fragment.path === "string" &&
      !fragment.path.startsWith(expectedPrefix),
  );
  if (outside) errors.push(`${path}.fragments must live under ${expectedPrefix}`);
  return errors;
};

export const validateReleasePlan = (value: unknown, path = "plan"): string[] => {
  if (!isRecord(value)) return [`${path} must be an object`];
  const errors = exactKeys(value, planKeys, path);
  const packageConfig = Object.values(packages).find((entry) => entry.name === value.package);
  errors.push(...validatePlanIdentity(value, path, packageConfig));
  errors.push(...validateApprovedPaths(value.approvedMetadataPaths, path));
  errors.push(
    ...validateLocatedFragments({
      value: value.fragments,
      path,
      packageConfig,
      version: value.version,
    }),
  );
  errors.push(...validatePlanRecords(value, path, packageConfig));
  errors.push(...validateSupportDeclarations(value.supportDeclarations, path));
  return errors;
};

const jsonFiles = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(path);
    return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
  });
};

interface RepositoryValidationContext {
  readonly root: string;
  readonly packageRoot: string;
  readonly config: PackageConfig;
}

const validateChangeRepositoryFile = (
  file: string,
  context: RepositoryValidationContext,
  ids: Map<string, string>,
): string[] => {
  const path = relative(context.root, file);
  const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const errors = validateChangeFragment(value, context.root, path);
  if (isRecord(value) && typeof value.id === "string") {
    const previous = ids.get(value.id);
    if (previous) errors.push(`${path}.id duplicates ${previous}`);
    else ids.set(value.id, path);
  }
  if (isRecord(value) && value.package !== context.config.name) {
    errors.push(`${path}.package must be ${context.config.name}`);
  }
  return errors;
};

const validateReleaseRepositoryFile = (
  file: string,
  context: RepositoryValidationContext,
): string[] => {
  const path = relative(context.root, file);
  const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const releaseRoot = join(context.packageRoot, "releases");
  const relativeReleasePath = relative(releaseRoot, file).split("\\").join("/");
  const pathMatch = /^([^/]+)\/(plan|receipt)\.json$/.exec(relativeReleasePath);
  const errors = pathMatch ? [] : [`${path} must be <version>/plan.json or <version>/receipt.json`];
  if (file.endsWith("/plan.json")) errors.push(...validateReleasePlan(value, path));
  else if (file.endsWith("/receipt.json")) errors.push(...validateReleaseReceipt(value, path));
  else errors.push(`${path} must be named plan.json or receipt.json`);
  if (isRecord(value) && value.package !== context.config.name) {
    errors.push(`${path}.package must be ${context.config.name}`);
  }
  if (isRecord(value) && pathMatch && value.version !== pathMatch[1]) {
    errors.push(`${path}.version must match its release directory`);
  }
  return errors;
};

const validatePlanReceiptPair = (directory: string, root: string): string[] => {
  const planPath = join(directory, "plan.json");
  const receiptPath = join(directory, "receipt.json");
  if (existsSync(receiptPath) && !existsSync(planPath)) {
    return [`${relative(root, receiptPath)} requires a sibling plan.json`];
  }
  if (!existsSync(planPath) || !existsSync(receiptPath)) return [];
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as unknown;
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as unknown;
  if (!isRecord(plan) || !isRecord(receipt)) return [];
  const path = relative(root, receiptPath);
  const errors = ["package", "version", "tag", "sourceSha"].flatMap((field) =>
    plan[field] === receipt[field] ? [] : [`${path}.${field} must match plan.json`],
  );
  if (plan.releaseSha !== "SELF" && plan.releaseSha !== receipt.releaseSha) {
    errors.push(`${path}.releaseSha must match plan.json`);
  }
  if (plan.releaseTree !== "SELF" && plan.releaseTree !== receipt.releaseTree) {
    errors.push(`${path}.releaseTree must match plan.json`);
  }
  return errors;
};

export const validateRepositoryProvenance = (root: string, key: PackageKey): string[] => {
  const config = packages[key];
  const packageRoot = join(root, config.directory);
  const context = { root, packageRoot, config };
  const ids = new Map<string, string>();
  const errors = jsonFiles(join(packageRoot, "changes")).flatMap((file) =>
    validateChangeRepositoryFile(file, context, ids),
  );
  const releaseFiles = jsonFiles(join(packageRoot, "releases"));
  errors.push(...releaseFiles.flatMap((file) => validateReleaseRepositoryFile(file, context)));
  const releaseDirectories = new Set(releaseFiles.map((file) => resolve(file, "..")));
  errors.push(
    ...[...releaseDirectories].flatMap((directory) => validatePlanReceiptPair(directory, root)),
  );
  return errors;
};

export const requiredReleasePlanPath = (root: string, key: PackageKey, version: string): string =>
  join(root, packages[key].directory, "releases", version, "plan.json");

export const readRequiredReleasePlan = (
  root: string,
  key: PackageKey,
  version: string,
): JsonRecord => {
  const path = requiredReleasePlanPath(root, key, version);
  if (!existsSync(path)) throw new Error(`Missing mandatory release plan: ${relative(root, path)}`);
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const errors = validateReleasePlan(value, relative(root, path));
  if (errors.length > 0) throw new Error(errors.join("\n"));
  if (!isRecord(value) || value.version !== version) {
    throw new Error(`${relative(root, path)} must describe ${version}`);
  }
  return value;
};

const parsePackage = (arguments_: readonly string[]): PackageKey | "all" => {
  const index = arguments_.indexOf("--package");
  const value = arguments_[index + 1];
  if (
    index < 0 ||
    (value !== "all" && value !== "aifsd" && value !== "llm-core" && value !== "strict-json")
  ) {
    throw new TypeError("Expected --package all, aifsd, llm-core or strict-json");
  }
  return value;
};

if (import.meta.main) {
  try {
    const root = resolve(import.meta.dir, "..");
    const selected = parsePackage(process.argv.slice(2));
    const keys: readonly PackageKey[] =
      selected === "all" ? ["strict-json", "llm-core", "aifsd"] : [selected];
    const errors = keys.flatMap((key) => validateRepositoryProvenance(root, key));
    if (errors.length > 0) throw new Error(errors.join("\n"));
    console.log(`Release provenance is coherent for ${keys.join(", ")}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
