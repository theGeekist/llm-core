import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkSloc,
  legacySnapshotSeal,
  physicalSourceLines,
  slocV1Policy,
  sourceDigest,
  type SlocBaseline,
  type SlocException,
} from "./check-sloc";

const roots: string[] = [];
const sourcePath = "packages/llm-core/src/large.ts";

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "llm-core-sloc-"));
  roots.push(root);
  mkdirSync(join(root, "packages/llm-core/src"), { recursive: true });
  mkdirSync(join(root, "packages/llm-core/internal/final-architecture/tasks"), { recursive: true });
  return root;
};

const contentWithLines = (count: number, marker = "line"): string =>
  Array.from({ length: count }, (_, index) => `${marker}-${index}`).join("\n") + "\n";

const baselineFor = (exception?: SlocException): SlocBaseline => ({
  version: 1,
  limit: slocV1Policy.limit,
  excludedDirectories: slocV1Policy.excludedDirectories,
  excludedSuffixes: slocV1Policy.excludedSuffixes,
  exceptions: exception ? { [sourcePath]: exception } : {},
});

const writeSource = (root: string, content: string): void => {
  writeFileSync(join(root, sourcePath), content);
};

const exceptionFor = (content: string, waiver?: SlocException["waiver"]): SlocException => ({
  lines: physicalSourceLines(content),
  sha256: sourceDigest(content),
  ...(waiver ? { waiver } : {}),
});

const runCheck = (root: string, baseline: SlocBaseline, today = "2026-08-03") =>
  checkSloc(root, baseline, { today, expectedLegacyEntries: legacySnapshotSeal(baseline) });

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("physical source lines", () => {
  test("does not count a final newline as another physical line", () => {
    expect(physicalSourceLines("one\ntwo\n")).toBe(2);
    expect(physicalSourceLines("")).toBe(0);
  });
});

describe("SLOC enforcement", () => {
  test("rejects a new oversized module", () => {
    const root = makeRoot();
    writeSource(root, contentWithLines(501));
    expect(runCheck(root, baselineFor()).errors).toContain(
      `${sourcePath} has 501 lines; limit is 500`,
    );
  });

  test("accepts an unchanged digest-pinned legacy exception", () => {
    const root = makeRoot();
    const content = contentWithLines(501);
    writeSource(root, content);
    expect(runCheck(root, baselineFor(exceptionFor(content))).errors).toEqual([]);
  });

  test.each([
    ["growth", 501, 502],
    ["same-size content change", 501, 501],
    ["reduced but still oversized content change", 503, 501],
  ])("rejects %s without a waiver", (_label, originalLines, changedLines) => {
    const root = makeRoot();
    const original = contentWithLines(originalLines, "before");
    writeSource(root, contentWithLines(changedLines, "after"));
    expect(runCheck(root, baselineFor(exceptionFor(original))).errors).toContain(
      `${sourcePath} changed; decompose it or record a versioned coordinator waiver`,
    );
  });

  test("requires removal of an exception after decomposition", () => {
    const root = makeRoot();
    const original = contentWithLines(501, "original");
    const content = contentWithLines(500);
    writeSource(root, content);
    const trusted = baselineFor(exceptionFor(original));
    expect(runCheck(root, trusted).errors.join("\n")).toContain("remove its stale exception");
    expect(
      checkSloc(root, baselineFor(), {
        today: "2026-08-03",
        expectedLegacyEntries: legacySnapshotSeal(baselineFor()),
      }).errors,
    ).toEqual([]);
  });

  test("accepts a current versioned waiver with an existing follow-up", () => {
    const root = makeRoot();
    const content = contentWithLines(502);
    writeSource(root, content);
    writeFileSync(
      join(root, "packages/llm-core/internal/final-architecture/tasks/decompose-large.md"),
      "---\nid: decompose-large\n---\n",
    );
    const original = contentWithLines(501, "original");
    const waiver = {
      version: 2,
      expiresOn: "2026-12-31",
      followUp: "decompose-large",
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors).toEqual([]);
  });

  test("rejects expired waivers and missing follow-ups", () => {
    const root = makeRoot();
    const content = contentWithLines(502);
    writeSource(root, content);
    const original = contentWithLines(501, "original");
    const waiver = {
      version: 1,
      expiresOn: "2026-01-01",
      followUp: "missing-task",
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    const errors = runCheck(root, baselineFor(exceptionFor(original, waiver))).errors;
    expect(errors.join("\n")).toContain("waiver expired");
    expect(errors.join("\n")).toContain("waiver follow-up does not exist");
  });

  test("rejects impossible waiver calendar dates", () => {
    const root = makeRoot();
    const content = contentWithLines(502);
    writeSource(root, content);
    const original = contentWithLines(501, "original");
    const waiver = {
      version: 1,
      expiresOn: "2026-99-99",
      followUp: "decompose-large",
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors.join("\n")).toContain(
      "valid YYYY-MM-DD date",
    );
  });

  test("rejects a changed source and rewritten legacy exception without a waiver", () => {
    const root = makeRoot();
    const original = contentWithLines(501, "original");
    const trusted = baselineFor(exceptionFor(original));
    const changed = contentWithLines(502, "changed");
    writeSource(root, changed);
    const rewritten = baselineFor(exceptionFor(changed));
    expect(
      checkSloc(root, rewritten, {
        today: "2026-08-03",
        expectedLegacyEntries: legacySnapshotSeal(trusted),
      }).errors.join("\n"),
    ).toContain("is not a sealed legacy exception");
  });

  test("rejects a new oversized file added directly as an unwaived exception", () => {
    const root = makeRoot();
    const trusted = baselineFor();
    const content = contentWithLines(501);
    writeSource(root, content);
    const rewritten = baselineFor(exceptionFor(content));
    expect(
      checkSloc(root, rewritten, {
        today: "2026-08-03",
        expectedLegacyEntries: legacySnapshotSeal(trusted),
      }).errors.join("\n"),
    ).toContain("is not a sealed legacy exception");
  });

  test("excludes generated, vendor and snapshot paths centrally", () => {
    const root = makeRoot();
    for (const path of ["generated/a.ts", "vendor/b.ts", "tests/__snapshots__/c.ts"]) {
      const absolute = join(root, path);
      mkdirSync(join(absolute, ".."), { recursive: true });
      writeFileSync(absolute, contentWithLines(20));
    }
    writeFileSync(join(root, "packages/llm-core/src/schema.generated.ts"), contentWithLines(20));
    expect(runCheck(root, baselineFor()).errors).toEqual([]);
  });

  test("rejects a changed version-1 limit and still enforces 500 lines", () => {
    const root = makeRoot();
    writeSource(root, contentWithLines(501));
    const baseline = { ...baselineFor(), limit: 1_000_000 };
    const errors = runCheck(root, baseline).errors.join("\n");
    expect(errors).toContain("version 1 limit must be exactly 500");
    expect(errors).toContain(`${sourcePath} has 501 lines; limit is 500`);
  });

  test("rejects broadened exclusions and scans with the canonical policy", () => {
    const root = makeRoot();
    writeSource(root, contentWithLines(501));
    const baseline = {
      ...baselineFor(),
      excludedDirectories: [...slocV1Policy.excludedDirectories, "packages"],
    };
    const errors = runCheck(root, baseline).errors.join("\n");
    expect(errors).toContain("excludedDirectories must match the canonical policy");
    expect(errors).toContain(`${sourcePath} has 501 lines; limit is 500`);
  });

  test("rejects removal of an entry from the sealed legacy set", () => {
    const root = makeRoot();
    const content = contentWithLines(501);
    writeSource(root, content);
    const trusted = baselineFor(exceptionFor(content));
    expect(
      checkSloc(root, baselineFor(), {
        today: "2026-08-03",
        expectedLegacyEntries: legacySnapshotSeal(trusted),
      }).errors.join("\n"),
    ).toContain(`${sourcePath} sealed legacy exception is missing`);
  });
});
