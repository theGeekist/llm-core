import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface CoverageMetric {
  readonly found: number;
  readonly hit: number;
  readonly percentage: number;
}

interface CoverageBaseline {
  readonly version: 1;
  readonly branches: CoverageMetric | null;
  readonly functions: CoverageMetric;
  readonly lines: CoverageMetric;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lcovPath = resolve(root, "coverage/lcov.info");
const baselinePath = resolve(root, "scripts/quality/coverage-baseline.json");
const baselineRepositoryPath = "scripts/quality/coverage-baseline.json";
const writeBaseline = process.argv.includes("--write-baseline");
const initialBaselineBase = "757dc5f07ef263e21c77b51d56e0f177dddbc9cc";
const initialBaselineSha256 = "da4f678bf364cb992641311dd9ea20202a4536f67c7fbf26141aa642a7fd9e38";

const percentage = (hit: number, found: number): number =>
  found === 0 ? 100 : Math.round((hit / found) * 10_000) / 100;

const metric = (hit: number, found: number): CoverageMetric => ({
  found,
  hit,
  percentage: percentage(hit, found),
});

export const coverageRegressed = (actual: CoverageMetric, baseline: CoverageMetric): boolean =>
  actual.hit * baseline.found < baseline.hit * actual.found;

export const parseLcovSummary = (content: string): CoverageBaseline => {
  const totals = { BRF: 0, BRH: 0, FNF: 0, FNH: 0, LF: 0, LH: 0 };
  for (const line of content.replaceAll("\r\n", "\n").split("\n")) {
    const match = /^(BRF|BRH|FNF|FNH|LF|LH):(\d+)$/.exec(line);
    if (match) totals[match[1] as keyof typeof totals] += Number(match[2]);
  }
  return {
    version: 1,
    branches: totals.BRF === 0 ? null : metric(totals.BRH, totals.BRF),
    functions: metric(totals.FNH, totals.FNF),
    lines: metric(totals.LH, totals.LF),
  };
};

const compareMetric = (
  name: "branches" | "functions" | "lines",
  actual: CoverageMetric,
  baseline: CoverageMetric,
): string[] =>
  coverageRegressed(actual, baseline)
    ? [`${name} coverage regressed from ${baseline.percentage}% to ${actual.percentage}%`]
    : [];

const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (
  value: unknown,
  expected: readonly string[],
  label: string,
): readonly string[] => {
  if (!record(value)) return [`${label} must be an object`];
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right));
  const canonical = [...expected].sort((left, right) => left.localeCompare(right));
  return actual.length === canonical.length &&
    actual.every((key, index) => key === canonical[index])
    ? []
    : [`${label} must contain exactly ${canonical.join(", ")}`];
};

const metricErrors = (label: string, value: unknown): readonly string[] => {
  const keyErrors = exactKeys(value, ["found", "hit", "percentage"], label);
  if (!record(value)) return keyErrors;
  const found = value.found;
  const hit = value.hit;
  const measuredPercentage = value.percentage;
  return [
    ...keyErrors,
    ...(Number.isSafeInteger(found) && (found as number) > 0
      ? []
      : [`${label} found must be a positive safe integer`]),
    ...(Number.isSafeInteger(hit) &&
    (hit as number) >= 0 &&
    typeof found === "number" &&
    (hit as number) <= found
      ? []
      : [`${label} hit must be a safe integer between zero and found`]),
    ...(typeof hit === "number" &&
    typeof found === "number" &&
    measuredPercentage === percentage(hit, found)
      ? []
      : [`${label} percentage must be derived exactly from hit and found`]),
  ];
};

const baselineShapeErrors = (baseline: unknown, label: string): readonly string[] => {
  const keyErrors = exactKeys(
    baseline,
    ["branches", "functions", "lines", "version"],
    `${label} baseline`,
  );
  if (!record(baseline)) return keyErrors;
  return [
    ...keyErrors,
    ...(baseline.version === 1 ? [] : [`${label} coverage baseline version must be 1`]),
    ...metricErrors(`${label} functions`, baseline.functions),
    ...metricErrors(`${label} lines`, baseline.lines),
    ...(baseline.branches === null ? [] : metricErrors(`${label} branches`, baseline.branches)),
  ];
};

const serialiseBaseline = (baseline: CoverageBaseline): string =>
  `${JSON.stringify(baseline, null, 2)}\n`;

const trustedRevision = (): string => {
  const configured = process.env.QUALITY_BASE_SHA;
  const revision =
    configured ??
    Bun.spawnSync(["git", "rev-parse", "--verify", "HEAD^{commit}"], {
      cwd: root,
      stderr: "pipe",
      stdout: "pipe",
    })
      .stdout.toString()
      .trim();
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("QUALITY_BASE_SHA must be a complete lowercase Git commit SHA");
  }
  return revision;
};

const loadTrustedBaseline = (revision: string): CoverageBaseline | undefined => {
  const result = Bun.spawnSync(["git", "show", `${revision}:${baselineRepositoryPath}`], {
    cwd: root,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) return undefined;
  try {
    return JSON.parse(result.stdout.toString()) as CoverageBaseline;
  } catch (error) {
    throw new Error(`Trusted coverage baseline at ${revision} is invalid JSON`, { cause: error });
  }
};

export const coverageBaselineEvolutionErrors = (
  candidate: CoverageBaseline,
  trusted: CoverageBaseline | undefined,
  options: Readonly<{ candidateSha256?: string; revision: string }>,
): readonly string[] => {
  const candidateSha256 =
    options.candidateSha256 ??
    createHash("sha256").update(serialiseBaseline(candidate)).digest("hex");
  if (trusted === undefined) {
    return options.revision === initialBaselineBase && candidateSha256 === initialBaselineSha256
      ? []
      : [
          `trusted revision ${options.revision} has no coverage baseline; bootstrap is restricted to base ${initialBaselineBase} and digest ${initialBaselineSha256}, observed ${candidateSha256}`,
        ];
  }
  const shapeErrors = [
    ...baselineShapeErrors(candidate, "candidate"),
    ...baselineShapeErrors(trusted, "trusted"),
  ];
  if (shapeErrors.length > 0) return shapeErrors;
  return [
    ...compareMetric("lines", candidate.lines, trusted.lines),
    ...compareMetric("functions", candidate.functions, trusted.functions),
    ...(candidate.branches === null || trusted.branches === null
      ? candidate.branches === trusted.branches
        ? []
        : ["trusted branch coverage availability changed"]
      : compareMetric("branches", candidate.branches, trusted.branches)),
  ];
};

if (import.meta.main) {
  if (!existsSync(lcovPath)) {
    throw new Error(`Missing coverage report at ${relative(root, lcovPath)}`);
  }
  const actual = parseLcovSummary(await Bun.file(lcovPath).text());
  if (actual.lines.found === 0 || actual.functions.found === 0) {
    throw new Error("Coverage report must contain line and function measurements");
  }
  const baseRevision = trustedRevision();
  const trustedBaseline = loadTrustedBaseline(baseRevision);

  if (writeBaseline) {
    const errors = coverageBaselineEvolutionErrors(actual, trustedBaseline, {
      revision: baseRevision,
    });
    if (errors.length > 0) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
      process.exit();
    }
    await Bun.write(baselinePath, serialiseBaseline(actual));
    const branchSummary =
      actual.branches === null
        ? "; Bun did not emit branch counters"
        : ` and ${actual.branches.percentage}% branches`;
    console.log(
      `Wrote ${relative(root, baselinePath)} at ${actual.lines.percentage}% lines and ${actual.functions.percentage}% functions${branchSummary}.`,
    );
  } else {
    const baseline = (await Bun.file(baselinePath).json()) as CoverageBaseline;
    const shapeErrors = baselineShapeErrors(baseline, "candidate");
    const errors =
      shapeErrors.length > 0
        ? shapeErrors
        : [
            ...coverageBaselineEvolutionErrors(baseline, trustedBaseline, {
              revision: baseRevision,
            }),
            ...compareMetric("lines", actual.lines, baseline.lines),
            ...compareMetric("functions", actual.functions, baseline.functions),
            ...(actual.branches === null || baseline.branches === null
              ? actual.branches === baseline.branches
                ? []
                : ["branch coverage availability changed; refresh the reviewed baseline"]
              : compareMetric("branches", actual.branches, baseline.branches)),
          ];
    if (errors.length > 0) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      const branchSummary =
        actual.branches === null
          ? "; branch counters unavailable from Bun"
          : ` and ${actual.branches.percentage}% branches`;
      console.log(
        `Coverage passed at ${actual.lines.percentage}% lines and ${actual.functions.percentage}% functions${branchSummary}.`,
      );
    }
  }
}
