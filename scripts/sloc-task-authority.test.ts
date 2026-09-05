import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validateActiveWaiver } from "./sloc-task-authority.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const validateScope = (scope: string): readonly string[] => {
  const root = mkdtempSync(join(tmpdir(), "sloc-scope-grammar-"));
  roots.push(root);
  const followUp = "packages/example/docs/tasks/decompose.md";
  const task = join(root, followUp);
  mkdirSync(dirname(task), { recursive: true });
  writeFileSync(task, `---\nid: decompose\nstatus: proposed\nwrite_scope:\n${scope}\n---\n`);
  return validateActiveWaiver({
    root,
    sourcePath: "packages/example/source.ts",
    today: "2026-09-05",
    waiver: {
      version: 1,
      currentLines: 700,
      currentSha256: "a".repeat(64),
      expiresOn: "2026-09-06",
      followUp,
    },
  });
};

test("scope authority preserves whitespace and quoted-item parsing", () => {
  for (const scope of [
    "  - packages/example/**",
    "  - 'packages/example/**'",
    "  - \r packages/example/**",
    "  - \u2028packages/example/**",
  ])
    expect(validateScope(scope)).toEqual([]);
});

test("line separators after scope content cannot grant waiver authority", () => {
  for (const separator of ["\rignored", "\u2028", "\u2029"])
    expect(validateScope(`  - packages/example/**${separator}`)).toEqual([
      "packages/example/source.ts waiver follow-up write_scope does not own the waived source",
    ]);
});

test("empty and duplicate quoted scopes still invalidate front matter", () => {
  for (const scope of [
    "  - ''",
    "  -  ",
    "  - \r ",
    "  - 'packages/example/**'\n  - 'packages/example/**'",
  ])
    expect(validateScope(scope)).toEqual([
      "packages/example/source.ts waiver follow-up must have canonical front matter with unique id, status and write_scope fields",
    ]);
});
