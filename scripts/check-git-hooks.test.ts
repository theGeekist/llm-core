import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface Manifest {
  readonly scripts: Readonly<Record<string, string>>;
  readonly "lint-staged": Readonly<Record<string, string | readonly string[]>>;
}

const root = resolve(import.meta.dir, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as Manifest;
const hook = (path: string): string => readFileSync(resolve(root, path), "utf8");
const git = (cwd: string, args: readonly string[]): string => {
  const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
};
const command = (cwd: string, file: string, source: string): string => {
  const directory = resolve(cwd, "bin");
  mkdirSync(directory, { recursive: true });
  const target = resolve(directory, file);
  writeFileSync(target, source);
  chmodSync(target, 0o755);
  return target;
};
const localCommand = (cwd: string, file: string, source: string): string => {
  const directory = resolve(cwd, "node_modules/.bin");
  mkdirSync(directory, { recursive: true });
  const target = resolve(directory, file);
  writeFileSync(target, source);
  chmodSync(target, 0o755);
  return target;
};
const run = (cwd: string, args: readonly string[], environment: Readonly<Record<string, string>>) =>
  Bun.spawnSync(args, {
    cwd,
    env: { ...process.env, ...environment },
    stderr: "pipe",
    stdout: "pipe",
  });

describe("repository Git hooks", () => {
  test("auto-fixes only staged supported files without weakening lint-staged safety", () => {
    expect(manifest.scripts["lint:staged"]).toBe("lint-staged --verbose");
    expect(manifest["lint-staged"]).toEqual({
      "**/*.{ts,tsx,js,jsx,mjs,cjs}": [
        "prettier --write",
        "eslint --fix --no-error-on-unmatched-pattern",
      ],
      "**/*.{json,md,yml,yaml}": "prettier --write",
    });

    for (const disallowedFlag of ["--no-stash", "--no-hide-partially-staged", "--no-revert"]) {
      expect(manifest.scripts["lint:staged"]).not.toContain(disallowedFlag);
    }
  });

  test("uses the staged fixer for both supported pre-commit entrypoints", () => {
    for (const path of [".husky/pre-commit", ".githooks/pre-commit"]) {
      const source = hook(path);
      expect(source).toContain("set -eu");
      expect(source).toContain("exec bun run lint:staged");
      expect(source).not.toContain("bun run format");
      expect(source).not.toContain("bun run lint:fix");
    }
  });

  test("formats the staged version while restoring an unstaged hunk", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "llm-core-hook-"));
    try {
      writeFileSync(
        resolve(sandbox, "package.json"),
        `${JSON.stringify({ "lint-staged": manifest["lint-staged"] })}\n`,
      );
      writeFileSync(resolve(sandbox, "note.md"), "# Title\n\n- one\n");
      git(sandbox, ["init", "--quiet"]);
      git(sandbox, ["config", "user.email", "hooks@example.test"]);
      git(sandbox, ["config", "user.name", "Hook Test"]);
      git(sandbox, ["add", "note.md"]);
      git(sandbox, ["commit", "--quiet", "-m", "initial"]);

      writeFileSync(resolve(sandbox, "note.md"), "# Title\n\n- one\n-   two\n");
      git(sandbox, ["add", "note.md"]);
      writeFileSync(resolve(sandbox, "note.md"), "# Title\n\n- one\n-   two\n\nUnstaged note\n");

      const result = Bun.spawnSync(
        [resolve(root, "node_modules/.bin/lint-staged"), "--cwd", sandbox],
        {
          cwd: sandbox,
          env: {
            ...process.env,
            PATH: `${resolve(root, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
          },
          stderr: "pipe",
          stdout: "pipe",
        },
      );

      expect(result.exitCode).toBe(0);
      expect(git(sandbox, ["diff", "--cached", "--", "note.md"])).toContain("+- two");
      expect(readFileSync(resolve(sandbox, "note.md"), "utf8")).toBe(
        "# Title\n\n- one\n- two\n\nUnstaged note\n",
      );
      expect(git(sandbox, ["diff", "--", "note.md"])).toContain("+Unstaged note");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 30_000);

  test("runs the CI build and canonical quality boundary before either supported push", () => {
    expect(manifest.scripts["quality:prepush"]).toBe("bun run build && bun run quality:check");
    expect(manifest.scripts["quality:prepush:fix"]).toBe("bun run scripts/quality/fix-prepush.ts");
    expect(manifest.scripts["quality:prepush:hook"]).toBe(
      "sh scripts/quality/with-node-version.sh sh scripts/quality/pre-push.sh",
    );

    const husky = hook(".husky/pre-push");
    expect(husky).toBe(hook(".githooks/pre-push"));
    expect(husky).toContain("exec bun run quality:prepush:hook");

    const policy = hook("scripts/quality/pre-push.sh");
    expect(policy).toContain("git status --porcelain=v1 -z --untracked-files=all");
    expect(policy.indexOf("bun run quality:prepush:fix")).toBeLessThan(
      policy.indexOf("exec bun run quality:prepush\n"),
    );
    expect(policy).toContain("Pre-push auto-fix changed tracked files. The push was blocked.");
    expect(policy).toContain(
      "Review the changes, stage them deliberately, commit again, then retry the push.",
    );
  });

  test("uses the repository Node declaration before pre-push work", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "llm-core-node-version-"));
    try {
      writeFileSync(resolve(sandbox, ".nvmrc"), "24.13.0\n");
      const log = resolve(sandbox, "node.log");
      command(sandbox, "node", '#!/usr/bin/env sh\nprintf "v%s\\n" "$FAKE_NODE_VERSION"\n');
      command(sandbox, "target", '#!/usr/bin/env sh\nnode --version > "$HOOK_LOG"\n');
      const path = `${resolve(sandbox, "bin")}:${process.env.PATH ?? ""}`;

      const exact = run(
        sandbox,
        ["sh", resolve(root, "scripts/quality/with-node-version.sh"), "target"],
        { FAKE_NODE_VERSION: "24.13.0", HOOK_LOG: log, PATH: path },
      );
      expect(exact.exitCode).toBe(0);
      expect(readFileSync(log, "utf8")).toBe("v24.13.0\n");

      const nvmDirectory = resolve(sandbox, "nvm");
      mkdirSync(nvmDirectory, { recursive: true });
      writeFileSync(
        resolve(nvmDirectory, "nvm.sh"),
        [
          "nvm() {",
          '  [ "$1" = "use" ] && [ "$2" = "24.13.0" ] || return 1',
          '  export FAKE_NODE_VERSION="$2"',
          "}",
          "",
        ].join("\n"),
      );
      const mismatch = run(
        sandbox,
        ["sh", resolve(root, "scripts/quality/with-node-version.sh"), "target"],
        {
          FAKE_NODE_VERSION: "22.22.0",
          HOOK_LOG: log,
          NVM_DIR: nvmDirectory,
          PATH: path,
        },
      );
      expect(mismatch.exitCode).toBe(0);
      expect(readFileSync(log, "utf8")).toBe("v24.13.0\n");

      rmSync(log, { force: true });
      const unavailable = run(
        sandbox,
        ["sh", resolve(root, "scripts/quality/with-node-version.sh"), "target"],
        {
          FAKE_NODE_VERSION: "22.22.0",
          HOOK_LOG: log,
          NVM_DIR: resolve(sandbox, "missing-nvm"),
          PATH: path,
        },
      );
      expect(unavailable.exitCode).toBe(1);
      expect(unavailable.stdout.toString()).toContain("Install it with: nvm install 24.13.0");
      expect(existsSync(log)).toBe(false);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("auto-fixes only upstream changes and formats after ESLint", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "llm-core-pre-push-changes-"));
    try {
      writeFileSync(resolve(sandbox, "changed.ts"), "const changed = 0;\n");
      const unrelated = resolve(sandbox, "unrelated.ts");
      const unrelatedContent = "const unrelated={};\n";
      writeFileSync(unrelated, unrelatedContent);
      const deleted = resolve(sandbox, "deleted.ts");
      writeFileSync(deleted, "const deleted = true;\n");
      writeFileSync(resolve(sandbox, ".gitignore"), "bin/\nbun.log\n");
      git(sandbox, ["init", "--quiet"]);
      git(sandbox, ["config", "user.email", "hooks@example.test"]);
      git(sandbox, ["config", "user.name", "Hook Test"]);
      git(sandbox, ["add", "."]);
      git(sandbox, ["commit", "--quiet", "-m", "initial"]);
      git(sandbox, ["branch", "-M", "main"]);
      git(sandbox, ["remote", "add", "origin", sandbox]);
      git(sandbox, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
      git(sandbox, ["branch", "--set-upstream-to=origin/main", "main"]);
      writeFileSync(resolve(sandbox, "changed.ts"), "const changed={};\n");
      rmSync(deleted);
      git(sandbox, ["add", "--all"]);
      git(sandbox, ["commit", "--quiet", "-m", "change only changed file"]);

      const log = resolve(sandbox, "bun.log");
      localCommand(
        sandbox,
        "eslint",
        [
          "#!/usr/bin/env sh",
          'printf "eslint %s\\n" "$*" >> "$HOOK_LOG"',
          'for argument in "$@"; do target="$argument"; done',
          "printf '%s\\n' 'const fixed=1;' > \"$target\"",
          "",
        ].join("\n"),
      );
      localCommand(
        sandbox,
        "prettier",
        [
          "#!/usr/bin/env sh",
          'printf "prettier %s\\n" "$*" >> "$HOOK_LOG"',
          'for argument in "$@"; do target="$argument"; done',
          "printf '%s\\n' 'const fixed = 1;' > \"$target\"",
          "",
        ].join("\n"),
      );
      const result = run(
        sandbox,
        [process.execPath, resolve(root, "scripts/quality/fix-prepush.ts")],
        { HOOK_LOG: log, PATH: "/usr/bin:/bin" },
      );

      expect(result.exitCode).toBe(0);
      expect(readFileSync(resolve(sandbox, "changed.ts"), "utf8")).toBe("const fixed = 1;\n");
      expect(readFileSync(unrelated, "utf8")).toBe(unrelatedContent);
      const calls = readFileSync(log, "utf8");
      expect(calls).toContain("eslint --fix --no-error-on-unmatched-pattern -- changed.ts");
      expect(calls).toContain("prettier --write -- changed.ts");
      expect(calls).not.toContain("unrelated.ts");
      expect(calls).not.toContain("deleted.ts");
      expect(calls.indexOf("eslint")).toBeLessThan(calls.indexOf("prettier"));
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("refuses a dirty tracked tree before invoking local auto-fix", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "llm-core-pre-push-dirty-"));
    try {
      writeFileSync(resolve(sandbox, "tracked.md"), "# Initial\n");
      writeFileSync(resolve(sandbox, ".gitignore"), "bin/\nbun.log\n");
      git(sandbox, ["init", "--quiet"]);
      git(sandbox, ["config", "user.email", "hooks@example.test"]);
      git(sandbox, ["config", "user.name", "Hook Test"]);
      git(sandbox, ["add", "tracked.md", ".gitignore"]);
      git(sandbox, ["commit", "--quiet", "-m", "initial"]);
      writeFileSync(resolve(sandbox, "tracked.md"), "# Dirty\n");

      const log = resolve(sandbox, "bun.log");
      command(sandbox, "bun", '#!/usr/bin/env sh\nprintf \'%s\\n\' "$*" >> "$HOOK_LOG"\n');
      const result = run(sandbox, ["sh", resolve(root, "scripts/quality/pre-push.sh")], {
        HOOK_LOG: log,
        PATH: `${resolve(sandbox, "bin")}:${process.env.PATH ?? ""}`,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toContain("Pre-push auto-fix requires a clean worktree.");
      expect(Bun.file(log).size).toBe(0);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("refuses an untracked supported file without invoking auto-fix", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "llm-core-pre-push-untracked-"));
    try {
      writeFileSync(resolve(sandbox, "tracked.md"), "# Initial\n");
      writeFileSync(resolve(sandbox, ".gitignore"), "bin/\nbun.log\n");
      git(sandbox, ["init", "--quiet"]);
      git(sandbox, ["config", "user.email", "hooks@example.test"]);
      git(sandbox, ["config", "user.name", "Hook Test"]);
      git(sandbox, ["add", "tracked.md", ".gitignore"]);
      git(sandbox, ["commit", "--quiet", "-m", "initial"]);

      const untracked = resolve(sandbox, "untracked.md");
      const content = "#Unformatted untracked work\n";
      writeFileSync(untracked, content);
      const log = resolve(sandbox, "bun.log");
      command(sandbox, "bun", '#!/usr/bin/env sh\nprintf \'%s\\n\' "$*" >> "$HOOK_LOG"\n');
      const result = run(sandbox, ["sh", resolve(root, "scripts/quality/pre-push.sh")], {
        HOOK_LOG: log,
        PATH: `${resolve(sandbox, "bin")}:${process.env.PATH ?? ""}`,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toContain("Pre-push auto-fix requires a clean worktree.");
      expect(readFileSync(untracked, "utf8")).toBe(content);
      expect(existsSync(log)).toBe(false);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("blocks generated fixes before the canonical quality boundary", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "llm-core-pre-push-fix-"));
    try {
      writeFileSync(resolve(sandbox, "tracked.md"), "# Initial\n");
      writeFileSync(resolve(sandbox, ".gitignore"), "bin/\nbun.log\n");
      git(sandbox, ["init", "--quiet"]);
      git(sandbox, ["config", "user.email", "hooks@example.test"]);
      git(sandbox, ["config", "user.name", "Hook Test"]);
      git(sandbox, ["add", "tracked.md", ".gitignore"]);
      git(sandbox, ["commit", "--quiet", "-m", "initial"]);

      const log = resolve(sandbox, "bun.log");
      command(
        sandbox,
        "bun",
        [
          "#!/usr/bin/env sh",
          'printf \'%s\\n\' "$*" >> "$HOOK_LOG"',
          'if [ "$2" = "quality:prepush:fix" ]; then',
          "  printf '%s\\n' '# Fixed locally' > tracked.md",
          "fi",
          "",
        ].join("\n"),
      );
      const result = run(sandbox, ["sh", resolve(root, "scripts/quality/pre-push.sh")], {
        HOOK_LOG: log,
        PATH: `${resolve(sandbox, "bin")}:${process.env.PATH ?? ""}`,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toContain(
        "Pre-push auto-fix changed tracked files. The push was blocked.",
      );
      expect(readFileSync(log, "utf8")).toBe("run quality:prepush:fix\n");
      expect(readFileSync(resolve(sandbox, "tracked.md"), "utf8")).toBe("# Fixed locally\n");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
