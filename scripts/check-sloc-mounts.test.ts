import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSloc, slocV1Policy, type SlocBaseline } from "./check-sloc";

const baseline: SlocBaseline = {
  version: 1,
  limit: slocV1Policy.limit,
  excludedDirectories: slocV1Policy.excludedDirectories,
  excludedSuffixes: slocV1Policy.excludedSuffixes,
  exceptions: {},
};

test("SLOC excludes the optional AIFSD private documentation mount exactly", () => {
  const root = mkdtempSync(join(tmpdir(), "llm-core-sloc-mount-"));
  const external = mkdtempSync(join(tmpdir(), "aifsd-private-docs-"));
  try {
    mkdirSync(join(root, "packages/aifsd"), { recursive: true });
    writeFileSync(join(external, "authority.ts"), "authority\n".repeat(501));
    symlinkSync(external, join(root, "packages/aifsd/docs"));

    expect(checkSloc(root, baseline, { expectedLegacyEntries: {} }).errors).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("SLOC excludes ignored external context mounts exactly", () => {
  const root = mkdtempSync(join(tmpdir(), "llm-core-sloc-context-"));
  const external = mkdtempSync(join(tmpdir(), "external-context-"));
  try {
    mkdirSync(join(root, "context"), { recursive: true });
    writeFileSync(join(external, "implementation.ts"), "implementation\n".repeat(501));
    symlinkSync(external, join(root, "context/simple-chat"));

    expect(checkSloc(root, baseline, { expectedLegacyEntries: {} }).errors).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});
