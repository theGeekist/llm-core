import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

export type CommandRunner = (command: readonly string[], cwd: string) => CommandResult;

export interface ExternalFixture {
  readonly directory: string;
  readonly relativeDirectory: string;
  readonly qualifyScript: string;
  readonly prebuiltQualifyScript?: string;
  readonly lockfile: string;
}

const ignoredDirectories = new Set([".git", ".worktrees", "coverage", "dist", "node_modules"]);

const walkDirectories = (directory: string): string[] => {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) {
      continue;
    }
    const child = join(directory, entry.name);
    if (entry.name === "external-consumer") {
      found.push(child);
      continue;
    }
    found.push(...walkDirectories(child));
  }
  return found;
};

const readManifest = (directory: string): Record<string, unknown> => {
  const manifestPath = join(directory, "package.json");
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `${manifestPath} must be a readable JSON manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const findLockfile = (directory: string): string => {
  for (const name of ["bun.lock", "bun.lockb"]) {
    try {
      readFileSync(join(directory, name));
      return name;
    } catch {
      // Try the other repository-owned Bun lockfile format.
    }
  }
  throw new Error(`${directory} must own bun.lock or bun.lockb`);
};

export const discoverExternalFixtures = (repositoryRoot: string): ExternalFixture[] =>
  walkDirectories(repositoryRoot)
    .sort()
    .map((directory) => {
      const manifest = readManifest(directory);
      const scripts = manifest.scripts;
      const qualifyScript =
        typeof scripts === "object" && scripts !== null
          ? (scripts as Record<string, unknown>).qualify
          : undefined;
      const prebuiltQualifyScript =
        typeof scripts === "object" && scripts !== null
          ? (scripts as Record<string, unknown>)["qualify:prebuilt"]
          : undefined;
      if (typeof qualifyScript !== "string" || qualifyScript.trim() === "") {
        throw new Error(
          `${join(directory, "package.json")} must define a non-empty qualify script`,
        );
      }
      return {
        directory,
        relativeDirectory: relative(repositoryRoot, directory).split("\\").join("/"),
        qualifyScript,
        prebuiltQualifyScript:
          typeof prebuiltQualifyScript === "string" && prebuiltQualifyScript.trim() !== ""
            ? prebuiltQualifyScript
            : undefined,
        lockfile: findLockfile(directory),
      };
    });

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

const runChecked = (
  runner: CommandRunner,
  fixture: ExternalFixture,
  command: readonly string[],
): void => {
  const result = runner(command, fixture.directory);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.exitCode !== 0) {
    throw new Error(
      `${fixture.relativeDirectory}: ${command.join(" ")} failed with exit code ${result.exitCode}`,
    );
  }
};

export const qualifyExternalFixtures = (
  repositoryRoot: string,
  runner: CommandRunner = defaultRunner,
  prebuilt = false,
): ExternalFixture[] => {
  const fixtures = discoverExternalFixtures(repositoryRoot);
  for (const fixture of fixtures) {
    runChecked(runner, fixture, ["bun", "install", "--frozen-lockfile"]);
    if (prebuilt && fixture.prebuiltQualifyScript === undefined) {
      throw new Error(`${fixture.relativeDirectory}: missing qualify:prebuilt script`);
    }
    runChecked(runner, fixture, ["bun", "run", prebuilt ? "qualify:prebuilt" : "qualify"]);
  }
  return fixtures;
};

if (import.meta.main) {
  try {
    const root = resolve(import.meta.dir, "..");
    const fixtures = qualifyExternalFixtures(
      root,
      defaultRunner,
      process.argv.includes("--prebuilt"),
    );
    console.log(
      `Qualified ${fixtures.length} external-consumer fixture${fixtures.length === 1 ? "" : "s"}.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
