import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const fixtureRoot = import.meta.dir;
const packageRoot = resolve(fixtureRoot, "../../../..");
const strictJsonRoot = resolve(packageRoot, "../strict-json");
const prebuilt = process.argv.includes("--prebuilt");

const run = (command: readonly string[], cwd: string, quiet = false): void => {
  const result = Bun.spawnSync([...command], {
    cwd,
    stderr: "inherit",
    stdout: quiet ? "pipe" : "inherit",
  });
  if (result.exitCode !== 0) {
    if (quiet && result.stdout) process.stdout.write(result.stdout);
    throw new Error(`${command.join(" ")} failed with exit code ${result.exitCode}`);
  }
};

const installPacked = (sourceRoot: string, packagePath: string): void => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "llm-core-protocol-consumer-"));
  try {
    if (!prebuilt) run(["bun", "run", "build"], sourceRoot);
    run(["bun", "pm", "pack", "--destination", temporaryRoot], sourceRoot, true);
    const tarball = readdirSync(temporaryRoot).find((name) => name.endsWith(".tgz"));
    if (!tarball) throw new Error(`bun pm pack did not produce a tarball for ${sourceRoot}`);
    const installRoot = join(fixtureRoot, "node_modules", packagePath);
    rmSync(installRoot, { force: true, recursive: true });
    mkdirSync(installRoot, { recursive: true });
    run(
      ["tar", "-xzf", join(temporaryRoot, tarball), "--strip-components=1", "-C", installRoot],
      fixtureRoot,
    );
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
};

installPacked(strictJsonRoot, "@aifsd/strict-json");
installPacked(packageRoot, "@geekist/llm-core");
