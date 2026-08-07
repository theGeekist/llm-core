import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, extname, join, posix, relative, resolve, sep } from "node:path";

export interface SlocWaiver {
  readonly version: number;
  readonly expiresOn: string;
  readonly followUp: string;
  readonly currentLines: number;
  readonly currentSha256: string;
}

export interface SlocException {
  readonly lines: number;
  readonly sha256: string;
  readonly waiver?: SlocWaiver;
}

export interface SlocBaseline {
  readonly version: number;
  readonly limit: number;
  readonly excludedDirectories: readonly string[];
  readonly excludedSuffixes: readonly string[];
  readonly exceptions: Readonly<Record<string, SlocException>>;
}

export interface SourceMeasurement {
  readonly path: string;
  readonly lines: number;
  readonly sha256: string;
}

const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const excludedWorkspaceRoots = Object.freeze(["context", "packages/aifsd/docs"]);
export const slocV1Policy = Object.freeze({
  limit: 500,
  excludedDirectories: Object.freeze([
    ".git",
    ".worktrees",
    "__snapshots__",
    "coverage",
    "dist",
    "generated",
    "node_modules",
    "vendor",
  ]),
  excludedSuffixes: Object.freeze([".generated.ts", ".generated.tsx", ".snap.ts", ".snap.tsx"]),
});
const sealedLegacyEntries: Readonly<Record<string, string>> = {
  "packages/llm-core/src/adapters/openspec/public.ts":
    "aead16e5dab2a848fcd3197b0c47623ba93389a24943f63f8cec7ba5a1f165a6",
  "packages/llm-core/src/adapters/pydantic-ai-spec/compiler.ts":
    "5c48d596367f4f7d3a29eb898aaa9bdb5278d0c80409e4843f661da54b1d0663",
  "packages/llm-core/src/adapters/spec-kit/public.ts":
    "ead646c6212830167be8052505f38ce771355eb24a151a9ef40e8775a9a826b7",
  "packages/llm-core/tests/application/agent/local-runner.test.ts":
    "4448a7cbf3201876d123942c8b6a29109a51faf1008815afceaba98b52b01f3b",
  "packages/llm-core/tests/application/agent/model-tool-program.test.ts":
    "dd8a67fa1cd28addf67ee5f74fadb968402228168227f2739a05c29d32326013",
  "packages/llm-core/tests/application/capability-bindings/bindings.test.ts":
    "ec634bbd3cb3c59e2406ce9667b20d3beb52afd237454d4e46eeece7153fdb43",
  "packages/llm-core/tests/application/interaction/session.test.ts":
    "d7a04a5ce399105f168cc621c5341ce1000615c6bc11746eede3758ddf3460ed",
  "packages/llm-core/tests/application/workflow/resume.test.ts":
    "ff4332c0039b361e2dbe66bb10a4c8f8863bf26dcba40392f2ac02cde871e5c9",
  "packages/llm-core/tests/evidence/tool-receipt-journal.test.ts":
    "c020e81e6a979bf7633f4dc12704d8b0859db2b379d19bdbfab105b2514ab040",
};

export const physicalSourceLines = (content: string): number => {
  if (content.length === 0) return 0;
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
};

export const sourceDigest = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

const normalized = (path: string): string => path.split(sep).join("/");

const isExcluded = (path: string, baseline: SlocBaseline): boolean => {
  const relativePath = normalized(path);
  const segments = relativePath.split("/");
  return (
    excludedWorkspaceRoots.some(
      (root) => relativePath === root || relativePath.startsWith(`${root}/`),
    ) ||
    segments.some((segment) => baseline.excludedDirectories.includes(segment)) ||
    baseline.excludedSuffixes.some((suffix) => relativePath.endsWith(suffix))
  );
};

interface SourceWalkResult {
  readonly files: readonly string[];
  readonly symbolicLinks: readonly string[];
}

interface SourceWalkContext {
  readonly root: string;
  readonly baseline: SlocBaseline;
  readonly symbolicLinks: string[];
}

const walk = (context: SourceWalkContext, directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = normalized(relative(context.root, path));
    if (isExcluded(relativePath, context.baseline)) continue;
    if (entry.isDirectory()) files.push(...walk(context, path));
    else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) files.push(path);
    else if (entry.isSymbolicLink()) context.symbolicLinks.push(relativePath);
  }
  return files;
};

const sourceWalk = (root: string, baseline: SlocBaseline): SourceWalkResult => {
  const symbolicLinks: string[] = [];
  return {
    files: walk({ root, baseline, symbolicLinks }, root),
    symbolicLinks: symbolicLinks.sort((left, right) => left.localeCompare(right)),
  };
};

const measureSourceFiles = (root: string, files: readonly string[]): SourceMeasurement[] =>
  files
    .map((path) => {
      const content = readFileSync(path, "utf8");
      return {
        path: normalized(relative(root, path)),
        lines: physicalSourceLines(content),
        sha256: sourceDigest(content),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

export const measureSources = (root: string, baseline: SlocBaseline): SourceMeasurement[] => {
  const sources = sourceWalk(root, baseline);
  return measureSourceFiles(root, sources.files);
};

const exactKeys = (value: object, allowed: readonly string[], label: string): string[] => {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  return unknown.map((key) => `${label} has unknown field ${key}`);
};

const isIsoCalendarDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

const isFollowUpPath = (value: string): boolean => {
  if (value.includes("\\") || posix.isAbsolute(value) || posix.normalize(value) !== value) {
    return false;
  }
  const segments = value.split("/");
  const taskIndex = segments.indexOf("tasks", 3);
  return (
    segments.length >= 5 &&
    segments[0] === "packages" &&
    segments[1] !== "" &&
    segments[1] !== "." &&
    segments[1] !== ".." &&
    segments[2] === "docs" &&
    segments.slice(3).every((segment) => segment !== "" && segment !== "." && segment !== "..") &&
    taskIndex >= 3 &&
    taskIndex === segments.length - 2 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(segments.at(-1)!)
  );
};

const isWithin = (parent: string, candidate: string): boolean => {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !posix.isAbsolute(path));
};

const canonicalFollowUp = (root: string, followUp: string): string | null => {
  try {
    const task = resolve(root, followUp);
    if (!lstatSync(task).isFile()) return null;
    const canonicalRoot = realpathSync(root);
    const canonicalTask = realpathSync(task);
    const packageDocs = realpathSync(resolve(root, ...followUp.split("/").slice(0, 3)));
    return isWithin(canonicalRoot, canonicalTask) && isWithin(packageDocs, canonicalTask)
      ? canonicalTask
      : null;
  } catch {
    return null;
  }
};

interface TaskFrontMatter {
  readonly id: string;
  readonly status: string;
}

const actionableTaskStatuses = new Set([
  "proposed",
  "ready",
  "claimed",
  "in_progress",
  "review",
  "blocked",
]);

const taskFrontMatter = (content: string): TaskFrontMatter | null => {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") return null;
  const closing = lines.indexOf("---", 1);
  if (closing < 0) return null;
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, closing)) {
    if (line.trim() === "" || line.trimStart().startsWith("#") || /^\s/.test(line)) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) return null;
    const key = line.slice(0, separator);
    if (!/^[a-z][a-z0-9_]*$/.test(key) || fields.has(key)) return null;
    fields.set(key, line.slice(separator + 1).trim());
  }
  const id = fields.get("id");
  const status = fields.get("status");
  return id !== undefined && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && status !== undefined
    ? { id, status }
    : null;
};

const validateWaiver = (path: string, waiver: SlocWaiver): string[] => {
  const errors = exactKeys(
    waiver,
    ["version", "expiresOn", "followUp", "currentLines", "currentSha256"],
    `${path} waiver`,
  );
  if (!Number.isInteger(waiver.version) || waiver.version < 1) {
    errors.push(`${path} waiver version must be a positive integer`);
  }
  if (!isIsoCalendarDate(waiver.expiresOn)) {
    errors.push(`${path} waiver expiry must be a valid YYYY-MM-DD date`);
  }
  if (!isFollowUpPath(waiver.followUp)) {
    errors.push(
      `${path} waiver followUp must be a normalized repository-relative task path under packages/<owner>/docs/**/tasks/`,
    );
  }
  if (!Number.isInteger(waiver.currentLines) || waiver.currentLines <= 0) {
    errors.push(`${path} waiver currentLines must be a positive integer`);
  }
  if (!/^[a-f0-9]{64}$/.test(waiver.currentSha256)) {
    errors.push(`${path} waiver currentSha256 must be a SHA-256 digest`);
  }
  return errors;
};

const legacyEntryDigest = (path: string, exception: SlocException): string =>
  sourceDigest(JSON.stringify({ path, lines: exception.lines, sha256: exception.sha256 }));

export const legacySnapshotSeal = (baseline: SlocBaseline): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(baseline.exceptions).map(([path, exception]) => [
      path,
      legacyEntryDigest(path, exception),
    ]),
  );

const validateException = (path: string, exception: SlocException, limit: number): string[] => {
  const errors = exactKeys(exception, ["lines", "sha256", "waiver"], `${path} exception`);
  if (!Number.isInteger(exception.lines) || exception.lines <= limit) {
    errors.push(`${path} exception must remain above ${limit} lines`);
  }
  if (!/^[a-f0-9]{64}$/.test(exception.sha256)) {
    errors.push(`${path} exception must have a SHA-256 digest`);
  }
  if (exception.waiver) errors.push(...validateWaiver(path, exception.waiver));
  return errors;
};

export const validateSlocBaseline = (
  baseline: SlocBaseline,
  expectedLegacyEntries: Readonly<Record<string, string>> = sealedLegacyEntries,
): string[] => {
  const errors = exactKeys(
    baseline,
    ["version", "limit", "excludedDirectories", "excludedSuffixes", "exceptions"],
    "SLOC baseline",
  );
  if (baseline.version !== 1) errors.push(`SLOC baseline version must be 1`);
  if (baseline.limit !== slocV1Policy.limit) {
    errors.push(`SLOC baseline version 1 limit must be exactly ${slocV1Policy.limit}`);
  }
  if (!sameStrings(baseline.excludedDirectories, slocV1Policy.excludedDirectories)) {
    errors.push(`SLOC baseline version 1 excludedDirectories must match the canonical policy`);
  }
  if (!sameStrings(baseline.excludedSuffixes, slocV1Policy.excludedSuffixes)) {
    errors.push(`SLOC baseline version 1 excludedSuffixes must match the canonical policy`);
  }
  for (const [path, exception] of Object.entries(baseline.exceptions)) {
    errors.push(...validateException(path, exception, slocV1Policy.limit));
    if (expectedLegacyEntries[path] !== legacyEntryDigest(path, exception)) {
      errors.push(`${path} is not a sealed legacy exception`);
    }
  }
  for (const path of Object.keys(expectedLegacyEntries)) {
    if (!Object.hasOwn(baseline.exceptions, path)) {
      errors.push(`${path} sealed legacy exception is missing`);
    }
  }
  return errors;
};

const sameStrings = (actual: readonly string[], expected: readonly string[]): boolean =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  actual.every((value, index) => value === expected[index]);

interface ActiveWaiverContext {
  readonly root: string;
  readonly sourcePath: string;
  readonly waiver: SlocWaiver;
  readonly today: string;
}

const validateActiveWaiver = ({
  root,
  sourcePath,
  waiver,
  today,
}: ActiveWaiverContext): string[] => {
  if (!isFollowUpPath(waiver.followUp)) return [];
  const task = canonicalFollowUp(root, waiver.followUp);
  const errors: string[] = [];
  if (task === null) {
    errors.push(
      `${sourcePath} waiver follow-up must be a non-symlink regular file within its package docs task boundary`,
    );
  } else {
    const expectedId = basename(task, ".md");
    const frontMatter = taskFrontMatter(readFileSync(task, "utf8"));
    if (frontMatter === null) {
      errors.push(
        `${sourcePath} waiver follow-up must have canonical front matter with unique id and status fields`,
      );
    } else if (frontMatter.id !== expectedId) {
      errors.push(`${sourcePath} waiver follow-up id must match its filename`);
    } else if (!actionableTaskStatuses.has(frontMatter.status)) {
      errors.push(
        `${sourcePath} waiver follow-up status must be actionable: proposed, ready, claimed, in_progress, review, or blocked`,
      );
    }
  }
  if (waiver.expiresOn < today) errors.push(`${sourcePath} waiver expired`);
  return errors;
};

interface MeasurementContext {
  readonly measurement: SourceMeasurement;
  readonly exception: SlocException | undefined;
  readonly limit: number;
}

const validateMeasurement = ({ measurement, exception, limit }: MeasurementContext): string[] => {
  if (measurement.lines <= limit) {
    return exception
      ? [`${measurement.path} is at or below the limit; remove its stale exception`]
      : [];
  }
  if (!exception) return [`${measurement.path} has ${measurement.lines} lines; limit is ${limit}`];
  const unchanged =
    measurement.lines === exception.lines && measurement.sha256 === exception.sha256;
  if (unchanged) {
    return exception.waiver ? [`${measurement.path} waiver is stale; remove it`] : [];
  }
  if (!exception.waiver) {
    return [`${measurement.path} changed; decompose it or record a versioned coordinator waiver`];
  }
  if (
    measurement.lines !== exception.waiver.currentLines ||
    measurement.sha256 !== exception.waiver.currentSha256
  ) {
    return [`${measurement.path} changed beyond its versioned coordinator waiver`];
  }
  return [];
};

export interface SlocCheckOptions {
  readonly today?: string;
  readonly expectedLegacyEntries?: Readonly<Record<string, string>>;
}

export const checkSloc = (
  root: string,
  baseline: SlocBaseline,
  options: SlocCheckOptions = {},
): { measurements: SourceMeasurement[]; errors: string[] } => {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const expectedLegacyEntries = options.expectedLegacyEntries ?? sealedLegacyEntries;
  const enforcedBaseline: SlocBaseline = {
    ...baseline,
    limit: slocV1Policy.limit,
    excludedDirectories: slocV1Policy.excludedDirectories,
    excludedSuffixes: slocV1Policy.excludedSuffixes,
  };
  const sources = sourceWalk(root, enforcedBaseline);
  const measurements = measureSourceFiles(root, sources.files);
  const byPath = new Map(measurements.map((measurement) => [measurement.path, measurement]));
  const errors = validateSlocBaseline(baseline, expectedLegacyEntries);

  for (const path of sources.symbolicLinks) {
    errors.push(`${path} is a symbolic link; symbolic links are not allowed in the measured tree`);
  }

  for (const [sourcePath, exception] of Object.entries(baseline.exceptions)) {
    if (exception.waiver) {
      errors.push(...validateActiveWaiver({ root, sourcePath, waiver: exception.waiver, today }));
    }
  }

  for (const measurement of measurements) {
    errors.push(
      ...validateMeasurement({
        measurement,
        exception: baseline.exceptions[measurement.path],
        limit: slocV1Policy.limit,
      }),
    );
  }

  for (const path of Object.keys(baseline.exceptions)) {
    if (!byPath.has(path)) errors.push(`${path} exception points to a missing or excluded file`);
  }
  return { measurements, errors };
};

export const readSlocBaseline = (path: string): SlocBaseline =>
  JSON.parse(readFileSync(path, "utf8")) as SlocBaseline;

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const baseline = readSlocBaseline(join(import.meta.dir, "sloc-baseline.json"));
  const result = checkSloc(root, baseline);
  if (process.argv.includes("--print-exceptions")) {
    console.log(
      JSON.stringify(
        Object.fromEntries(
          result.measurements
            .filter(({ lines }) => lines > slocV1Policy.limit)
            .map(({ path, lines, sha256 }) => [path, { lines, sha256 }]),
        ),
        null,
        2,
      ),
    );
  } else if (result.errors.length > 0) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      `Checked ${result.measurements.length} source modules at a ${slocV1Policy.limit}-line limit.`,
    );
  }
}
