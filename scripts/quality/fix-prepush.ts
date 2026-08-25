const text = (output: Uint8Array): string => new TextDecoder().decode(output);

const git = (arguments_: readonly string[]): string => {
  const result = Bun.spawnSync(["git", ...arguments_], { stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(text(result.stderr).trim() || `git ${arguments_.join(" ")} failed`);
  }
  return text(result.stdout);
};

const run = (command: readonly string[]): void => {
  const result = Bun.spawnSync(command, { stderr: "inherit", stdout: "inherit" });
  if (result.exitCode !== 0) process.exit(result.exitCode);
};

const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]).trim();
if (upstream === "") throw new Error("Pre-push auto-fix requires a configured upstream branch");

const base = git(["merge-base", "HEAD", upstream]).trim();
const root = git(["rev-parse", "--show-toplevel"]).trim();
const changed = git(["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}..HEAD`])
  .split("\0")
  .filter((path) => path !== "");
const eslintFiles = changed.filter((path) => /\.(?:ts|tsx|js|jsx)$/u.test(path));
const prettierFiles = changed.filter((path) => /\.(?:ts|tsx|js|jsx|json|md|yml|yaml)$/u.test(path));

if (eslintFiles.length > 0)
  run([
    join(root, "node_modules/.bin/eslint"),
    "--fix",
    "--no-error-on-unmatched-pattern",
    "--",
    ...eslintFiles,
  ]);
if (prettierFiles.length > 0)
  run([join(root, "node_modules/.bin/prettier"), "--write", "--", ...prettierFiles]);
import { join } from "node:path";
