import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import type { ArchitectureTask } from "./architecture-task-plan";
import {
  taskPlanConfiguration,
  type TaskPlanConfiguration,
  type TaskStatus,
} from "./architecture-task-plan.config";
import type { ScopeAlias } from "./architecture-task-scope";

export interface RequiredReading {
  readonly path: string;
  readonly reason: string;
  readonly ref: string | null;
}

interface ReadingRecord {
  readonly [key: string]: unknown;
}

interface ResolvedReading {
  readonly absolutePath: string;
  readonly mutableReadingStatuses: readonly TaskStatus[] | null;
  readonly sourceRoot: string;
  readonly sourcePrefix: string | null;
}

interface RevisionReadingOptions {
  readonly configuration: TaskPlanConfiguration;
  readonly readingPath: string;
  readonly ref: string;
  readonly resolved: ResolvedReading;
}

export interface ReadingSourceState {
  readonly aliases: readonly ScopeAlias[];
  readonly unavailable: readonly string[];
}

interface ValidateReadingOptions {
  readonly configuration: TaskPlanConfiguration;
  readonly readScope: readonly string[];
  readonly reading: readonly RequiredReading[];
  readonly scopeAliases: readonly ScopeAlias[];
  readonly scopesOverlap: (left: string, right: string, aliases: readonly ScopeAlias[]) => boolean;
  readonly source: string;
  readonly status: TaskStatus;
  readonly workspaceRoot: string;
}

interface ValidateTaskReadingsOptions {
  readonly configuration?: TaskPlanConfiguration;
  readonly scopeAliases?: readonly ScopeAlias[];
  readonly scopesOverlap: (left: string, right: string, aliases: readonly ScopeAlias[]) => boolean;
  readonly tasks: readonly ArchitectureTask[];
  readonly workspaceRoot: string;
}

const record = (value: unknown): ReadingRecord | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ReadingRecord)
    : null;

interface RequiredStringOptions {
  readonly field: string;
  readonly message: string;
  readonly source: string;
}

const requiredString = (
  value: unknown,
  { field, message, source }: RequiredStringOptions,
): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${source}: ${field} ${message}`);
  }
  return value;
};

const exactLocalPath = (value: string): boolean => {
  const segments = value.split("/");
  return (
    value === normalize(value) &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !value.includes("://") &&
    !/[?*[\]{}]/.test(value) &&
    !value.endsWith("/") &&
    segments.every((segment) => segment !== "." && segment !== "..")
  );
};

export const parseRequiredReading = (
  value: unknown,
  configuration: TaskPlanConfiguration,
  source: string,
): readonly RequiredReading[] => {
  const field = configuration.frontMatter.requiredReading;
  const fields = configuration.readingEntry;
  const messages = configuration.messages.errors;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${source}: ${field} ${messages.missingReading}`);
  }
  const allowed = new Set(Object.values(fields));
  const reading = value.map((item, index): RequiredReading => {
    const entry = record(item);
    const entrySource = `${source}: ${field}[${index}]`;
    if (entry === null) throw new Error(`${entrySource}: ${messages.invalidReadingEntry}`);
    const unknown = Object.keys(entry).find((key) => !allowed.has(key));
    if (unknown !== undefined) {
      throw new Error(`${entrySource}: ${messages.unknownReadingField} ${unknown}`);
    }
    const path = requiredString(entry[fields.path], {
      field: fields.path,
      message: messages.nonEmptyString,
      source: entrySource,
    });
    if (!exactLocalPath(path)) throw new Error(`${entrySource}: ${messages.invalidReadingPath}`);
    const reason = requiredString(entry[fields.reason], {
      field: fields.reason,
      message: messages.nonEmptyString,
      source: entrySource,
    });
    const rawRef = entry[fields.ref];
    if (rawRef !== undefined && (typeof rawRef !== "string" || !/^[a-f0-9]{40}$/.test(rawRef))) {
      throw new Error(`${entrySource}: ${messages.invalidReadingRef}`);
    }
    return { path, reason, ref: (rawRef as string | undefined) ?? null };
  });
  const keys = reading.map(({ path, ref }) => `${path}@${ref ?? "current"}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`${source}: ${messages.duplicateReading}`);
  }
  return reading;
};

const readingSources = (
  configuration: TaskPlanConfiguration,
): TaskPlanConfiguration["contextSources"] => {
  const sources = [...configuration.contextSources];
  const prefixes = new Set(sources.map(({ pathPrefix }) => pathPrefix));
  for (const authority of Object.values(configuration.authorities)) {
    if (authority.logicalMount === null || prefixes.has(authority.logicalMount)) continue;
    sources.unshift({
      mutableReadingStatuses: null,
      pathPrefix: authority.logicalMount,
      rootFromWorkspace: authority.logicalMount,
    });
    prefixes.add(authority.logicalMount);
  }
  return sources;
};

const resolveReading = (
  workspaceRoot: string,
  readingPath: string,
  configuration: TaskPlanConfiguration,
): ResolvedReading => {
  const sources = readingSources(configuration);
  const source = sources
    .filter(
      ({ pathPrefix }) =>
        pathPrefix !== null &&
        (readingPath === pathPrefix || readingPath.startsWith(`${pathPrefix}/`)),
    )
    .sort((left, right) => right.pathPrefix!.length - left.pathPrefix!.length)[0];
  const fallback = sources.find(({ pathPrefix }) => pathPrefix === null);
  const selected = source ?? fallback;
  if (selected === undefined) {
    throw new Error(configuration.messages.errors.missingContextSource);
  }
  const configuredRoot = resolve(workspaceRoot, selected.rootFromWorkspace);
  const sourceRoot = existsSync(configuredRoot) ? realpathSync(configuredRoot) : configuredRoot;
  const pathFromSource =
    selected.pathPrefix === null ? readingPath : readingPath.slice(selected.pathPrefix.length + 1);
  return {
    absolutePath: resolve(sourceRoot, pathFromSource),
    mutableReadingStatuses: selected.mutableReadingStatuses,
    sourceRoot,
    sourcePrefix: selected.pathPrefix,
  };
};

const isContained = (root: string, target: string): boolean => {
  const path = relative(root, target);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
};

const assertReadingContained = (
  resolved: ResolvedReading,
  readingPath: string,
  configuration: TaskPlanConfiguration,
): void => {
  if (!isContained(resolved.sourceRoot, resolved.absolutePath)) {
    throw new Error(`${configuration.messages.errors.readingOutsideSource} ${readingPath}`);
  }
  if (!existsSync(resolved.sourceRoot) || !existsSync(resolved.absolutePath)) return;
  if (!isContained(realpathSync(resolved.sourceRoot), realpathSync(resolved.absolutePath))) {
    throw new Error(`${configuration.messages.errors.readingOutsideSource} ${readingPath}`);
  }
};

export const readingSourceAliases = (
  workspaceRoot: string,
  configuration: TaskPlanConfiguration,
  readingPaths: readonly string[],
): ReadingSourceState => {
  const needed = new Map(
    readingPaths.flatMap((readingPath) => {
      const resolved = resolveReading(workspaceRoot, readingPath, configuration);
      if (resolved.sourcePrefix === null) return [];
      return [[resolved.sourcePrefix, resolved.sourceRoot] as const];
    }),
  );
  const aliases: ScopeAlias[] = [];
  const unavailable: string[] = [];
  for (const [logical, physical] of needed) {
    if (!existsSync(physical)) unavailable.push(logical);
    else aliases.push({ logical, physical: realpathSync(physical) });
  }
  return { aliases, unavailable };
};

const gitRootCache = new Map<string, string>();

const revisionRepository = (sourceRoot: string, configuration: TaskPlanConfiguration): string => {
  const cached = gitRootCache.get(sourceRoot);
  if (cached !== undefined) return cached;
  const result = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    cwd: sourceRoot,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `${configuration.messages.errors.cannotResolveGitRoot} ${sourceRoot}: ${result.stderr.toString().trim()}`,
    );
  }
  const repository = realpathSync(result.stdout.toString().trim());
  gitRootCache.set(sourceRoot, repository);
  return repository;
};

const immutableGitObjectPattern = /^[0-9a-f]{40}(?::.*)?$/i;
const gitObjectTypeCache = new Map<string, string | null>();

const gitObjectType = (repository: string, object: string): string | null => {
  const cacheKey = `${repository}\0${object}`;
  if (immutableGitObjectPattern.test(object) && gitObjectTypeCache.has(cacheKey)) {
    return gitObjectTypeCache.get(cacheKey) ?? null;
  }
  const result = Bun.spawnSync(["git", "cat-file", "-t", object], {
    cwd: repository,
    stderr: "pipe",
    stdout: "pipe",
  });
  const type = result.exitCode === 0 ? result.stdout.toString().trim() : null;
  if (immutableGitObjectPattern.test(object)) gitObjectTypeCache.set(cacheKey, type);
  return type;
};

const validateRevisionReading = ({
  configuration,
  readingPath,
  ref,
  resolved,
}: RevisionReadingOptions): void => {
  const repository = revisionRepository(resolved.sourceRoot, configuration);
  if (!isContained(repository, resolved.absolutePath)) {
    throw new Error(`${configuration.messages.errors.readingOutsideSource} ${readingPath}`);
  }
  if (gitObjectType(repository, ref) !== "commit") {
    throw new Error(`${configuration.messages.errors.invalidReadingRevision} ${ref}`);
  }
  const pathAtRef = relative(repository, resolved.absolutePath).split(sep).join("/");
  const type = gitObjectType(repository, `${ref}:${pathAtRef}`);
  if (type === null) {
    throw new Error(`${configuration.messages.errors.missingReadingRef} ${ref}:${readingPath}`);
  }
  if (type !== "blob") {
    throw new Error(`${configuration.messages.errors.invalidReadingObject} ${ref}:${readingPath}`);
  }
};

interface ValidateResolvedReadingOptions {
  readonly configuration: TaskPlanConfiguration;
  readonly entry: RequiredReading;
  readonly resolved: ResolvedReading;
  readonly source: string;
}

const validateAvailableReading = ({
  configuration,
  entry,
  resolved,
  source,
}: ValidateResolvedReadingOptions): void => {
  if (entry.ref === null) {
    if (!existsSync(resolved.absolutePath) || !statSync(resolved.absolutePath).isFile()) {
      throw new Error(
        `${source}: ${configuration.messages.errors.missingReadingPath} ${entry.path}`,
      );
    }
    return;
  }
  try {
    validateRevisionReading({
      configuration,
      readingPath: entry.path,
      ref: entry.ref,
      resolved,
    });
  } catch (error) {
    throw new Error(`${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

interface ValidateReadingEntryOptions extends ValidateResolvedReadingOptions {
  readonly aliases: readonly ScopeAlias[];
  readonly readScope: readonly string[];
  readonly scopesOverlap: ValidateReadingOptions["scopesOverlap"];
  readonly sourceUnavailable: boolean;
  readonly status: TaskStatus;
}

const validateReadingEntry = ({
  aliases,
  configuration,
  entry,
  readScope,
  resolved,
  scopesOverlap,
  source,
  sourceUnavailable,
  status,
}: ValidateReadingEntryOptions): void => {
  const messages = configuration.messages.errors;
  assertReadingContained(resolved, entry.path, configuration);
  if (
    entry.ref === null &&
    resolved.mutableReadingStatuses !== null &&
    !resolved.mutableReadingStatuses.includes(status)
  ) {
    throw new Error(`${source}: ${messages.mutableReadingStatus} ${entry.path}: ${status}`);
  }
  if (!sourceUnavailable) validateAvailableReading({ configuration, entry, resolved, source });
  if (!readScope.some((scope) => scopesOverlap(scope, entry.path, aliases))) {
    throw new Error(`${source}: ${messages.readingOutsideScope} ${entry.path}`);
  }
};

export const validateGoverningReading = (
  workspaceRoot: string,
  paths: readonly string[],
  configuration: TaskPlanConfiguration,
): void => {
  for (const path of paths) {
    const resolved = resolveReading(workspaceRoot, path, configuration);
    assertReadingContained(resolved, path, configuration);
    if (!existsSync(resolved.absolutePath) || !statSync(resolved.absolutePath).isFile()) {
      throw new Error(`${configuration.messages.errors.missingReadingPath} ${path}`);
    }
  }
};

export const validateRequiredReading = ({
  configuration,
  readScope,
  reading,
  scopeAliases,
  scopesOverlap,
  source,
  status,
  workspaceRoot,
}: ValidateReadingOptions): readonly string[] => {
  const sourceState = readingSourceAliases(
    workspaceRoot,
    configuration,
    reading.map(({ path }) => path),
  );
  const aliases = [...scopeAliases, ...sourceState.aliases];
  const unavailable = new Set(sourceState.unavailable);
  for (const entry of reading) {
    const resolved = resolveReading(workspaceRoot, entry.path, configuration);
    validateReadingEntry({
      aliases,
      configuration,
      entry,
      readScope,
      resolved,
      scopesOverlap,
      source,
      sourceUnavailable: resolved.sourcePrefix !== null && unavailable.has(resolved.sourcePrefix),
      status,
    });
  }
  return sourceState.unavailable;
};

export const validateTaskReadings = ({
  configuration = taskPlanConfiguration,
  scopeAliases = [],
  scopesOverlap,
  tasks,
  workspaceRoot,
}: ValidateTaskReadingsOptions): readonly string[] => {
  const unavailableReadingSources = new Set<string>();
  for (const task of tasks) {
    const unavailable = validateRequiredReading({
      configuration,
      reading: task.requiredReading,
      readScope: task.readScope,
      scopeAliases,
      scopesOverlap,
      source: task.path,
      status: task.status,
      workspaceRoot,
    });
    for (const source of unavailable) unavailableReadingSources.add(source);
  }
  return [...unavailableReadingSources].sort();
};
