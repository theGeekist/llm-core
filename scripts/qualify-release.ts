import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CommandResult, CommandRunner } from "./qualify-external-fixtures";

export interface ReleaseQualifier {
  readonly surface: string;
  readonly supportWindow: string;
  readonly owner: string;
  readonly command: readonly string[];
}

export interface ReleaseQualifierRegistry {
  readonly version: number;
  readonly requiredSurfaces: readonly string[];
  readonly qualifiers: readonly ReleaseQualifier[];
}

export const baselineReleaseCommands: readonly (readonly string[])[] = [
  ["bun", "install", "--frozen-lockfile"],
  ["bun", "run", "lint"],
  ["bun", "run", "--cwd", "packages/llm-core", "release:build"],
  ["bun", "run", "test:package"],
  ["bun", "run", "qualify:external-fixtures"],
  ["bun", "run", "docs:check"],
  ["bun", "run", "--cwd", "packages/llm-core", "format:check"],
  ["bun", "run", "check:sloc"],
];

const expectedRootEntrypoint = "bun run scripts/qualify-release.ts";
const expectedPublishEntrypoint = "bun run --cwd ../.. release:qualify:llm-core && bun publish";
const sealedUnconditionalSurfaces = new Set([
  ".",
  "./contracts",
  "./model",
  "./model/runtime",
  "./tools",
  "./tools/runtime",
  "./control",
  "./control/runtime",
  "./evidence",
  "./state",
  "./context",
  "./artifacts",
  "./evaluation",
  "./agent",
  "./agent/runtime",
  "./workflow",
  "./conversation",
  "./interaction",
  "./retrieval",
  "./indexing",
  "./storage",
  "./memory",
  "./media",
  "./specifications",
  "./adapters/ai-sdk",
  "./adapters/ai-sdk-ui",
  "./adapters/assistant-ui",
  "./adapters/openai-chatkit",
  "./adapters/nlux-ui",
]);

const readJson = <Value>(path: string): Value => JSON.parse(readFileSync(path, "utf8")) as Value;

const unknownKeys = (value: object, allowed: readonly string[]): string[] =>
  Object.keys(value).filter((key) => !allowed.includes(key));

const validateQualifier = (
  qualifier: ReleaseQualifier,
  index: number,
  surfaces: Set<string>,
): string[] => {
  const label = `qualifier ${index}`;
  const errors = unknownKeys(qualifier, ["surface", "supportWindow", "owner", "command"]).map(
    (key) => `${label} has unknown field ${key}`,
  );
  for (const field of ["surface", "supportWindow", "owner"] as const) {
    if (
      typeof qualifier[field] !== "string" ||
      qualifier[field].trim() === "" ||
      qualifier[field] !== qualifier[field].trim()
    ) {
      errors.push(`${label} ${field} must be a non-empty string`);
    }
  }
  if (
    typeof qualifier.surface === "string" &&
    !/^\.\/[a-z0-9][a-z0-9./-]*$/.test(qualifier.surface)
  ) {
    errors.push(`${label} surface must be a canonical package subpath`);
  }
  if (surfaces.has(qualifier.surface))
    errors.push(`duplicate qualifier surface ${qualifier.surface}`);
  surfaces.add(qualifier.surface);
  if (
    !Array.isArray(qualifier.command) ||
    qualifier.command.length === 0 ||
    qualifier.command.some((part: unknown) => typeof part !== "string" || part.trim() === "")
  ) {
    errors.push(`${label} command must be a non-empty string array`);
  }
  return errors;
};

const validateRequiredSurfaces = (
  value: unknown,
): { readonly errors: string[]; readonly surfaces: Set<string> } => {
  const errors: string[] = [];
  const surfaces = new Set<string>();
  if (!Array.isArray(value)) {
    return {
      errors: ["qualifier registry requiredSurfaces must be an array"],
      surfaces,
    };
  }
  for (const [index, surface] of value.entries()) {
    if (typeof surface !== "string" || !/^\.\/[a-z0-9][a-z0-9./-]*$/.test(surface)) {
      errors.push(`required surface ${index} must be a canonical package subpath`);
      continue;
    }
    if (surfaces.has(surface)) errors.push(`duplicate required surface ${surface}`);
    surfaces.add(surface);
  }
  return { errors, surfaces };
};

const qualifierCoverageErrors = (
  required: ReadonlySet<string>,
  published: ReadonlySet<string>,
  qualified: ReadonlySet<string>,
): string[] => {
  const errors: string[] = [];
  for (const surface of required) {
    if (!qualified.has(surface)) errors.push(`required qualifier missing for ${surface}`);
    if (!published.has(surface)) {
      errors.push(`required surface is not a published conditional export ${surface}`);
    }
  }
  for (const surface of published) {
    if (!required.has(surface)) {
      errors.push(`published conditional export missing from requiredSurfaces ${surface}`);
    }
  }
  for (const surface of qualified) {
    if (!required.has(surface)) errors.push(`qualifier has no required surface ${surface}`);
  }
  return errors;
};

export const validateQualifierRegistry = (
  registry: ReleaseQualifierRegistry,
  publishedConditionalSurfaces?: readonly string[],
): string[] => {
  const errors: string[] = [];
  for (const key of unknownKeys(registry, ["version", "requiredSurfaces", "qualifiers"])) {
    errors.push(`qualifier registry has unknown field ${key}`);
  }
  if (registry.version !== 1) errors.push("qualifier registry version must be 1");
  const required = validateRequiredSurfaces(registry.requiredSurfaces);
  errors.push(...required.errors);
  const published = validatePublishedConditionalSurfaces(publishedConditionalSurfaces);
  errors.push(...published.errors);
  if (!Array.isArray(registry.qualifiers)) {
    errors.push("qualifier registry qualifiers must be an array");
    return errors;
  }
  const surfaces = new Set<string>();
  for (const [index, qualifier] of registry.qualifiers.entries()) {
    if (typeof qualifier !== "object" || qualifier === null) {
      errors.push(`qualifier ${index} must be an object`);
      continue;
    }
    errors.push(...validateQualifier(qualifier, index, surfaces));
  }
  errors.push(...qualifierCoverageErrors(required.surfaces, published.surfaces, surfaces));
  return errors;
};

const validatePublishedConditionalSurfaces = (
  value: readonly string[] | undefined,
): { readonly errors: string[]; readonly surfaces: Set<string> } => {
  if (!Array.isArray(value)) {
    return {
      errors: ["published conditional surface inventory must be an array"],
      surfaces: new Set(),
    };
  }
  return { errors: [], surfaces: new Set(value) };
};

const conditionalSurfaceInventory = (
  root: string,
): { readonly errors: string[]; readonly surfaces: string[] } => {
  const manifest = readJson<{ exports?: unknown }>(join(root, "packages/llm-core/package.json"));
  if (
    typeof manifest.exports !== "object" ||
    manifest.exports === null ||
    Array.isArray(manifest.exports)
  ) {
    return { errors: ["package exports must be an object"], surfaces: [] };
  }
  const errors: string[] = [];
  const surfaces = Object.keys(manifest.exports)
    .filter((surface) => !sealedUnconditionalSurfaces.has(surface))
    .filter((surface) => {
      if (/^\.\/[a-z0-9][a-z0-9./-]*$/.test(surface)) return true;
      errors.push(`package export ${surface} is not a canonical conditional surface`);
      return false;
    })
    .sort();
  return { errors, surfaces };
};

export const validateReleaseEntrypoints = (root: string): string[] => {
  const rootManifest = readJson<{ scripts?: Record<string, string> }>(join(root, "package.json"));
  const packageManifest = readJson<{ scripts?: Record<string, string> }>(
    join(root, "packages/llm-core/package.json"),
  );
  const releaseWorkflow = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
  const errors: string[] = [];
  if (rootManifest.scripts?.["release:qualify:llm-core"] !== expectedRootEntrypoint) {
    errors.push("root release:qualify:llm-core must own the canonical release orchestrator");
  }
  if (packageManifest.scripts?.["publish:npm"] !== expectedPublishEntrypoint) {
    errors.push("package publish:npm must delegate to root release:qualify:llm-core");
  }
  const workflowLines = releaseWorkflow.split("\n");
  const releaseCoreStart = workflowLines.findIndex((line) => line.trimEnd() === "  release-core:");
  const isJobHeader = (line: string): boolean =>
    line.startsWith("  ") && !line.startsWith("    ") && line.trimEnd().endsWith(":");
  const nextJob = workflowLines.findIndex(
    (line, index) => index > releaseCoreStart && isJobHeader(line),
  );
  const releaseCoreLines =
    releaseCoreStart < 0
      ? []
      : workflowLines
          .slice(releaseCoreStart + 1, nextJob < 0 ? undefined : nextJob)
          .filter((line) => !line.trimStart().startsWith("#"));
  const qualification = releaseCoreLines.findIndex(
    (line) => line.trim() === "run: bun run release:qualify:llm-core",
  );
  const publication = releaseCoreLines.findIndex(
    (line) => line.trim() === "run: npm publish --access public",
  );
  if (qualification < 0 || publication < 0 || qualification > publication) {
    errors.push("tagged npm publication must follow root release:qualify:llm-core");
  }
  return errors;
};

export const validateWorkflowPolicy = (root: string): string[] => {
  return [
    ".github/workflows/ci.yml",
    ".github/workflows/docs.yml",
    ".github/workflows/release.yml",
  ].flatMap((path) => workflowPolicyErrors(root, path));
};

const workflowBlockCommands = (
  lines: readonly string[],
  start: number,
  indentation: number,
): { readonly commands: string[]; readonly next: number } => {
  const commands: string[] = [];
  let next = start;
  while (next < lines.length) {
    const line = lines[next] ?? "";
    const lineIndentation = line.length - line.trimStart().length;
    if (line.trim() !== "" && lineIndentation <= indentation) break;
    if (line.trim() !== "") commands.push(line.trim());
    next += 1;
  }
  return { commands, next };
};

const workflowRunCommands = (lines: readonly string[]): string[] => {
  const commands: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    index += 1;
    const indentation = line.length - line.trimStart().length;
    const item = line.trim().replace(/^-\s+/, "");
    if (!item.startsWith("run:")) continue;
    const value = item.slice("run:".length).trim();
    if (!/^[|>][+-]?$/.test(value)) {
      if (value !== "") commands.push(value);
      continue;
    }
    const block = workflowBlockCommands(lines, index, indentation);
    commands.push(...block.commands);
    index = block.next;
  }
  return commands;
};

const isMutableBunInstall = (command: string): boolean =>
  command.split(/&&|\|\||[;|]/).some((segment) => {
    const trimmed = segment.trim();
    const comment = trimmed.indexOf(" #");
    const install = comment < 0 ? trimmed : trimmed.slice(0, comment);
    return /^bun\s+install(?:\s|$)/.test(install) && install !== "bun install --frozen-lockfile";
  });

const workflowPolicyErrors = (root: string, path: string): string[] => {
  const lines = readFileSync(join(root, path), "utf8").split("\n");
  const setupCount = lines.filter((line) => line.includes("uses: oven-sh/setup-bun@v2")).length;
  const pinCount = lines.filter(
    (line) => line.trim() === 'bun-version-file: ".bun-version"',
  ).length;
  const errors: string[] = [];
  if (setupCount === 0 || pinCount !== setupCount) {
    errors.push(`${path} must source every Bun setup from .bun-version`);
  }
  if (workflowRunCommands(lines).some(isMutableBunInstall)) {
    errors.push(`${path} has a mutable or package-local Bun install`);
  }
  return errors;
};

const defaultRunner: CommandRunner = (command, cwd) => {
  const result = Bun.spawnSync([...command], {
    cwd,
    env: process.env,
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
};

const runChecked = (runner: CommandRunner, root: string, command: readonly string[]): void => {
  const result: CommandResult = runner(command, root);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${result.exitCode}`);
  }
};

export const qualifyRelease = (
  root: string,
  runner: CommandRunner = defaultRunner,
  actualBunVersion = Bun.version,
): void => {
  const expectedBunVersion = readFileSync(join(root, ".bun-version"), "utf8").trim();
  if (actualBunVersion !== expectedBunVersion) {
    throw new Error(`Bun ${expectedBunVersion} is required; running ${actualBunVersion}`);
  }
  readFileSync(join(root, "bun.lock"));
  const entrypointErrors = [...validateReleaseEntrypoints(root), ...validateWorkflowPolicy(root)];
  if (entrypointErrors.length > 0) throw new Error(entrypointErrors.join("\n"));

  const registry = readJson<ReleaseQualifierRegistry>(
    join(root, "scripts/release-qualifiers.json"),
  );
  const inventory = conditionalSurfaceInventory(root);
  const registryErrors = [
    ...inventory.errors,
    ...validateQualifierRegistry(registry, inventory.surfaces),
  ];
  if (registryErrors.length > 0) throw new Error(registryErrors.join("\n"));

  console.log(`Release qualification uses Bun ${actualBunVersion}.`);
  for (const command of baselineReleaseCommands) runChecked(runner, root, command);
  for (const qualifier of registry.qualifiers) {
    console.log(
      `Qualifying ${qualifier.surface} (${qualifier.supportWindow}; owner: ${qualifier.owner}).`,
    );
    runChecked(runner, root, qualifier.command);
  }
};

if (import.meta.main) {
  try {
    qualifyRelease(resolve(import.meta.dir, ".."));
    console.log("llm-core release qualification passed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
