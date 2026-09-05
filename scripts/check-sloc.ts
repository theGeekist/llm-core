import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { isFollowUpPath, validateActiveWaiver } from "./sloc-task-authority.js";

export interface SlocWaiver {
  readonly version: number;
  readonly justification?: string;
  readonly expiresOn?: string;
  readonly followUp?: string;
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
  hardLimit: 600,
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
};

export const approximateTargetJustification = "approximately 500 lines";

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

const validateWaiver = (path: string, waiver: SlocWaiver): string[] => {
  const errors = exactKeys(
    waiver,
    ["version", "justification", "expiresOn", "followUp", "currentLines", "currentSha256"],
    `${path} waiver`,
  );
  if (!Number.isInteger(waiver.version) || waiver.version < 1) {
    errors.push(`${path} waiver version must be a positive integer`);
  }
  if (!Number.isInteger(waiver.currentLines) || waiver.currentLines <= 0) {
    errors.push(`${path} waiver currentLines must be a positive integer`);
  }
  if (!/^[a-f0-9]{64}$/.test(waiver.currentSha256)) {
    errors.push(`${path} waiver currentSha256 must be a SHA-256 digest`);
  }
  errors.push(
    ...(waiver.currentLines <= slocV1Policy.hardLimit
      ? lightweightWaiverErrors(path, waiver)
      : hardBoundaryWaiverErrors(path, waiver)),
  );
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
    errors.push(...sealedExceptionErrors(path, exception, expectedLegacyEntries));
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

interface MeasurementContext {
  readonly measurement: SourceMeasurement;
  readonly exception: SlocException | undefined;
  readonly limit: number;
  readonly hardLimit: number;
}

const lightweightWaiverRequired = (path: string, lines: number, limit: number): string =>
  `${path} has ${lines} lines; target is ${limit}; record an ${JSON.stringify(approximateTargetJustification)} waiver`;

type ExistingMeasurementContext = MeasurementContext & { readonly exception: SlocException };

const validateUnchangedMeasurement = ({
  measurement,
  exception,
  limit,
  hardLimit,
}: ExistingMeasurementContext): string[] => {
  if (measurement.lines > hardLimit) {
    return exception.waiver ? [`${measurement.path} waiver is stale; remove it`] : [];
  }
  if (!exception.waiver) {
    return [lightweightWaiverRequired(measurement.path, measurement.lines, limit)];
  }
  return measurement.lines === exception.waiver.currentLines &&
    measurement.sha256 === exception.waiver.currentSha256
    ? []
    : [`${measurement.path} changed beyond its approximately-500 waiver`];
};

const validateChangedMeasurement = ({
  measurement,
  exception,
  limit,
  hardLimit,
}: ExistingMeasurementContext): string[] => {
  if (!exception.waiver) {
    return measurement.lines <= hardLimit
      ? [lightweightWaiverRequired(measurement.path, measurement.lines, limit)]
      : [`${measurement.path} changed; decompose it or record a versioned coordinator waiver`];
  }
  return measurement.lines === exception.waiver.currentLines &&
    measurement.sha256 === exception.waiver.currentSha256
    ? []
    : [`${measurement.path} changed beyond its versioned coordinator waiver`];
};

const validateMeasurement = ({
  measurement,
  exception,
  limit,
  hardLimit,
}: MeasurementContext): string[] => {
  if (measurement.lines <= limit) {
    return exception
      ? [`${measurement.path} is at or below the limit; remove its stale exception`]
      : [];
  }
  if (!exception) {
    return measurement.lines <= hardLimit
      ? [lightweightWaiverRequired(measurement.path, measurement.lines, limit)]
      : [
          `${measurement.path} has ${measurement.lines} lines; hard limit is ${hardLimit}; decompose it or record a versioned coordinator waiver`,
        ];
  }
  const unchanged =
    measurement.lines === exception.lines && measurement.sha256 === exception.sha256;
  const context = { measurement, exception, limit, hardLimit };
  return unchanged ? validateUnchangedMeasurement(context) : validateChangedMeasurement(context);
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
    if (exception.waiver && exception.waiver.currentLines > slocV1Policy.hardLimit) {
      errors.push(...validateActiveWaiver({ root, sourcePath, waiver: exception.waiver, today }));
    }
  }

  for (const measurement of measurements) {
    errors.push(
      ...validateMeasurement({
        measurement,
        exception: baseline.exceptions[measurement.path],
        limit: slocV1Policy.limit,
        hardLimit: slocV1Policy.hardLimit,
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

const lightweightWaiverErrors = (path: string, waiver: SlocWaiver): string[] => {
  const errors: string[] = [];
  if (waiver.justification !== approximateTargetJustification) {
    errors.push(
      `${path} waiver justification must be exactly ${JSON.stringify(approximateTargetJustification)}`,
    );
  }
  if (waiver.expiresOn !== undefined || waiver.followUp !== undefined) {
    errors.push(`${path} approximately-500 waiver must not require expiry or follow-up`);
  }

  return errors;
};
const hardBoundaryWaiverErrors = (path: string, waiver: SlocWaiver): string[] => {
  const errors: string[] = [];
  if (typeof waiver.justification !== "string" || waiver.justification.trim() === "") {
    errors.push(`${path} hard-boundary waiver justification must not be empty`);
  }
  if (waiver.expiresOn === undefined || !isIsoCalendarDate(waiver.expiresOn)) {
    errors.push(`${path} waiver expiry must be a valid YYYY-MM-DD date`);
  }
  if (waiver.followUp === undefined || !isFollowUpPath(waiver.followUp)) {
    errors.push(
      `${path} waiver followUp must be a normalized repository-relative task path under packages/<owner>/docs/**/tasks/`,
    );
  }

  return errors;
};

const sealedExceptionErrors = (
  path: string,
  exception: SlocException,
  expectedLegacyEntries: Readonly<Record<string, string>>,
): string[] => {
  const errors: string[] = [];
  const sealedDigest = expectedLegacyEntries[path];
  const isLightweightException =
    exception.lines <= slocV1Policy.hardLimit &&
    exception.waiver !== undefined &&
    exception.waiver.currentLines <= slocV1Policy.hardLimit &&
    exception.waiver.justification === approximateTargetJustification;
  if (
    (sealedDigest !== undefined && sealedDigest !== legacyEntryDigest(path, exception)) ||
    (sealedDigest === undefined && !isLightweightException)
  ) {
    errors.push(`${path} is not a sealed legacy exception`);
  }

  return errors;
};

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
      `Checked ${result.measurements.length} source modules at a ${slocV1Policy.limit}-line target and ${slocV1Policy.hardLimit}-line hard limit.`,
    );
  }
}
