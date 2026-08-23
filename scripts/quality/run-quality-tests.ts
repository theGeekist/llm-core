import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const coveragePath = resolve(root, "coverage/lcov.info");

if (existsSync(coveragePath)) rmSync(coveragePath);

const tests = Bun.spawn(
  [
    "bun",
    "test",
    "scripts",
    "packages",
    "apps/aifsd-headless-workbench",
    "apps/aifsd-project-semantics-characterization",
    "--coverage",
    "--coverage-reporter=text",
    "--coverage-reporter=lcov",
    "--timeout=120000",
  ],
  { cwd: root, stderr: "inherit", stdout: "inherit" },
);
const testExit = await tests.exited;
if (testExit !== 0) process.exit(testExit);

const coverage = Bun.spawn(["bun", "run", "quality:coverage"], {
  cwd: root,
  stderr: "inherit",
  stdout: "inherit",
});
process.exit(await coverage.exited);
