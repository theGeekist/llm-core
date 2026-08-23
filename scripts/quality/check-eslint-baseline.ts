import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface EslintMessage {
  readonly column: number;
  readonly line: number;
  readonly message: string;
  readonly ruleId: string | null;
  readonly severity: number;
}

interface EslintFileResult {
  readonly errorCount: number;
  readonly filePath: string;
  readonly messages: readonly EslintMessage[];
  readonly suppressedMessages?: readonly EslintMessage[];
  readonly warningCount: number;
}

interface EslintBaseline {
  readonly version: 2;
  readonly eslint: string;
  readonly suppressions: Readonly<Record<string, number>>;
  readonly warnings: Readonly<Record<string, number>>;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baselinePath = resolve(root, "scripts/quality/eslint-baseline.json");
const baselineRepositoryPath = "scripts/quality/eslint-baseline.json";
const eslintPath = resolve(root, "node_modules/.bin/eslint");
const writeBaseline = process.argv.includes("--write-baseline");
const initialBaselineBase = "e9399df47cb2f9018f7aa8c74f5592972c63b3d5";
const initialBaselineSha256 = "11c6ea54d2e4fff302135e56f2138da59e9b53b07a5996ae56af9426f45ea861";

const childScopes = (directory: string): readonly (readonly string[])[] =>
  readdirSync(resolve(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => Object.freeze([`${directory}/${entry.name}`]));

const knownPackages = new Set(["aifsd", "llm-core", "strict-json"]);
const additionalPackageScopes = readdirSync(resolve(root, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !knownPackages.has(entry.name))
  .map((entry) => Object.freeze([`packages/${entry.name}`]));

const scopes = Object.freeze([
  Object.freeze(["packages/strict-json/index.ts", "packages/strict-json/src"]),
  Object.freeze(["packages/strict-json/scripts"]),
  Object.freeze(["packages/strict-json/tests"]),
  Object.freeze(["packages/llm-core/index.ts", "packages/llm-core/src"]),
  Object.freeze(["packages/llm-core/scripts"]),
  Object.freeze(["packages/llm-core/tests/*.ts", "packages/llm-core/tests/*.mjs"]),
  ...childScopes("packages/llm-core/tests"),
  Object.freeze(["packages/aifsd/src"]),
  Object.freeze(["packages/aifsd/scripts"]),
  Object.freeze(["packages/aifsd/tests/*.ts", "packages/aifsd/tests/*.mjs"]),
  ...childScopes("packages/aifsd/tests"),
  ...additionalPackageScopes,
  Object.freeze(["apps"]),
  Object.freeze([
    "scripts",
    "examples",
    "docs/snippets",
    "docs/.vitepress",
    ".prettierrc.cjs",
    "eslint.config.js",
  ]),
]);

const countBy = (keys: readonly string[]): Readonly<Record<string, number>> =>
  Object.fromEntries(
    [...keys]
      .reduce(
        (counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1),
        new Map<string, number>(),
      )
      .entries(),
  );

const sortedRecord = (values: Readonly<Record<string, number>>): Readonly<Record<string, number>> =>
  Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));

const ruleKey = (message: EslintMessage): string => message.ruleId ?? "eslint/unused-disable";

const sourceLine = (content: string, line: number): string =>
  (content.replaceAll("\r\n", "\n").split("\n")[line - 1] ?? "").trim();

export const warningAnchor = (path: string, message: EslintMessage, content: string): string =>
  JSON.stringify([
    path,
    message.line,
    message.column,
    ruleKey(message),
    message.message,
    sourceLine(content, message.line),
  ]);

export const suppressionAnchor = (path: string, message: EslintMessage, content: string): string =>
  JSON.stringify([
    path,
    message.line,
    message.column,
    ruleKey(message),
    message.message,
    createHash("sha256").update(content).digest("hex"),
  ]);

const runScope = async (scope: readonly string[]): Promise<readonly EslintFileResult[]> => {
  const process = Bun.spawn(
    [eslintPath, ...scope, "--format", "json", "--no-error-on-unmatched-pattern"],
    {
      cwd: root,
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode > 1) {
    throw new Error(
      `ESLint could not analyse ${scope.join(", ")} (exit ${exitCode})\n${stderr || stdout}`,
    );
  }
  try {
    return JSON.parse(stdout) as readonly EslintFileResult[];
  } catch (error) {
    throw new Error(`ESLint returned invalid JSON for ${scope.join(", ")}`, { cause: error });
  }
};

const loadBaseline = async (): Promise<EslintBaseline> => {
  if (!existsSync(baselinePath)) {
    throw new Error(`Missing ESLint baseline at ${relative(root, baselinePath)}`);
  }
  return (await Bun.file(baselinePath).json()) as EslintBaseline;
};

const serialiseBaseline = (baseline: EslintBaseline): string =>
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

const loadTrustedBaseline = (revision: string): EslintBaseline | undefined => {
  const result = Bun.spawnSync(["git", "show", `${revision}:${baselineRepositoryPath}`], {
    cwd: root,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) return undefined;
  try {
    return JSON.parse(result.stdout.toString()) as EslintBaseline;
  } catch (error) {
    throw new Error(`Trusted ESLint baseline at ${revision} is invalid JSON`, { cause: error });
  }
};

const eslintVersion = async (): Promise<string> => {
  const process = Bun.spawn([eslintPath, "--version"], { cwd: root, stdout: "pipe" });
  const version = (await new Response(process.stdout).text()).trim().replace(/^v/, "");
  const exitCode = await process.exited;
  if (exitCode !== 0 || version === "") throw new Error("Unable to resolve the ESLint version");
  return version;
};

export const compareAnchors = (
  label: string,
  actual: Readonly<Record<string, number>>,
  baseline: Readonly<Record<string, number>>,
): string[] => {
  const errors: string[] = [];
  for (const [rule, count] of Object.entries(actual)) {
    const allowed = baseline[rule] ?? 0;
    if (count > allowed) errors.push(`${label} ${rule} increased from ${allowed} to ${count}`);
  }
  return errors;
};

const anchorCountErrors = (
  label: string,
  anchors: Readonly<Record<string, number>>,
): readonly string[] =>
  Object.entries(anchors).flatMap(([anchor, count]) =>
    Number.isSafeInteger(count) && count > 0
      ? []
      : [`${label} ${anchor} must have a positive safe-integer count`],
  );

export const baselineEvolutionErrors = (
  candidate: EslintBaseline,
  trusted: EslintBaseline | undefined,
  options: Readonly<{ candidateSha256?: string; revision: string }>,
): readonly string[] => {
  const candidateSha256 =
    options.candidateSha256 ??
    createHash("sha256").update(serialiseBaseline(candidate)).digest("hex");
  if (trusted === undefined) {
    return options.revision === initialBaselineBase && candidateSha256 === initialBaselineSha256
      ? []
      : [
          `trusted revision ${options.revision} has no ESLint baseline; bootstrap is restricted to base ${initialBaselineBase} and digest ${initialBaselineSha256}, observed ${candidateSha256}`,
        ];
  }
  if (trusted.version !== 2) return ["trusted ESLint baseline version must be 2"];
  return [
    ...compareAnchors("trusted warning", candidate.warnings ?? {}, trusted.warnings ?? {}),
    ...compareAnchors(
      "trusted suppression",
      candidate.suppressions ?? {},
      trusted.suppressions ?? {},
    ),
  ];
};

export const exactBaselineErrors = (
  observed: EslintBaseline,
  candidate: EslintBaseline,
): readonly string[] => [
  ...(candidate.version === 2 ? [] : ["ESLint baseline version must be 2"]),
  ...(candidate.eslint === observed.eslint
    ? []
    : [`ESLint baseline targets ${candidate.eslint}, installed version is ${observed.eslint}`]),
  ...anchorCountErrors("baseline warning", candidate.warnings ?? {}),
  ...anchorCountErrors("baseline suppression", candidate.suppressions ?? {}),
  ...compareAnchors("warning", observed.warnings ?? {}, candidate.warnings ?? {}),
  ...compareAnchors("stale baseline warning", candidate.warnings ?? {}, observed.warnings ?? {}),
  ...compareAnchors("suppression", observed.suppressions ?? {}, candidate.suppressions ?? {}),
  ...compareAnchors(
    "stale baseline suppression",
    candidate.suppressions ?? {},
    observed.suppressions ?? {},
  ),
];

if (import.meta.main) {
  const results: EslintFileResult[] = [];
  for (const scope of scopes) {
    console.log(`Linting ${scope.join(", ")}...`);
    results.push(...(await runScope(scope)));
  }

  const contentByPath = new Map(
    results.map((file) => [file.filePath, readFileSync(file.filePath, "utf8")] as const),
  );
  const hardErrors = results.flatMap((file) =>
    file.messages
      .filter(({ severity }) => severity === 2)
      .map(
        (message) =>
          `${relative(root, file.filePath)}:${message.line}:${message.column} ${ruleKey(message)} ${message.message}`,
      ),
  );
  const warnings = sortedRecord(
    countBy(
      results.flatMap((file) =>
        file.messages
          .filter(({ severity }) => severity === 1)
          .map((message) =>
            warningAnchor(
              relative(root, file.filePath),
              message,
              contentByPath.get(file.filePath)!,
            ),
          ),
      ),
    ),
  );
  const suppressions = sortedRecord(
    countBy(
      results.flatMap((file) =>
        (file.suppressedMessages ?? []).map((message) =>
          suppressionAnchor(
            relative(root, file.filePath),
            message,
            contentByPath.get(file.filePath)!,
          ),
        ),
      ),
    ),
  );
  const version = await eslintVersion();
  const candidateBaseline: EslintBaseline = {
    version: 2,
    eslint: version,
    suppressions,
    warnings,
  };
  const baseRevision = trustedRevision();
  const trustedBaseline = loadTrustedBaseline(baseRevision);
  const checkedInBaselineSha256 =
    trustedBaseline === undefined && existsSync(baselinePath)
      ? createHash("sha256").update(readFileSync(baselinePath)).digest("hex")
      : undefined;
  const evolutionErrors = baselineEvolutionErrors(candidateBaseline, trustedBaseline, {
    revision: baseRevision,
    ...(checkedInBaselineSha256 === undefined ? {} : { candidateSha256: checkedInBaselineSha256 }),
  });

  if (hardErrors.length > 0) {
    console.error(hardErrors.join("\n"));
    console.error(`ESLint reported ${hardErrors.length} hard error(s).`);
    process.exitCode = 1;
  } else if (evolutionErrors.length > 0) {
    console.error(evolutionErrors.join("\n"));
    process.exitCode = 1;
  } else if (writeBaseline) {
    await Bun.write(baselinePath, serialiseBaseline(candidateBaseline));
    console.log(
      `Wrote ${relative(root, baselinePath)} with ${Object.values(warnings).reduce((sum, count) => sum + count, 0)} anchored warning(s) and ${Object.values(suppressions).reduce((sum, count) => sum + count, 0)} digest-bound suppression(s).`,
    );
  } else {
    const baseline = await loadBaseline();
    const errors = exactBaselineErrors(candidateBaseline, baseline);
    if (errors.length > 0) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      const warningTotal = Object.values(warnings).reduce((sum, count) => sum + count, 0);
      const suppressionTotal = Object.values(suppressions).reduce((sum, count) => sum + count, 0);
      console.log(
        `ESLint ${version} passed with ${warningTotal} anchored warning(s) and ${suppressionTotal} digest-bound suppression(s).`,
      );
    }
  }
}
