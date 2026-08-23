import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  approximateTargetJustification,
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
const followUpPath = "packages/llm-core/docs/final-architecture/tasks/decompose-large.md";
const hardWaiverJustification = "changed legacy module above 600 lines pending decomposition";

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "llm-core-sloc-"));
  roots.push(root);
  mkdirSync(join(root, "packages/llm-core/src"), { recursive: true });
  mkdirSync(join(root, "packages/llm-core/docs/final-architecture/tasks"), { recursive: true });
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

const taskFrontMatter = (
  id = "decompose-large",
  status = "proposed",
  writeScope: readonly string[] = [sourcePath],
): string =>
  `---\narchitecture_version: 2\nid: ${id}\ntitle: Decompose large\nstage: architecture\nstatus: ${status}\nwrite_scope:\n${writeScope.map((path) => `  - ${path}`).join("\n")}\n---\n`;

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
  test("requires the lightweight waiver above the 500-line target", () => {
    const root = makeRoot();
    writeSource(root, contentWithLines(589));
    expect(runCheck(root, baselineFor()).errors).toContain(
      `${sourcePath} has 589 lines; target is 500; record an ${JSON.stringify(approximateTargetJustification)} waiver`,
    );
  });

  test("accepts approximately 500 lines as the complete lightweight waiver justification", () => {
    const root = makeRoot();
    const content = contentWithLines(589);
    writeSource(root, content);
    const waiver = {
      version: 1,
      justification: approximateTargetJustification,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    expect(
      checkSloc(root, baselineFor(exceptionFor(content, waiver)), {
        expectedLegacyEntries: {},
      }).errors,
    ).toEqual([]);
  });

  test("rejects an invented lightweight waiver justification", () => {
    const root = makeRoot();
    const content = contentWithLines(589);
    writeSource(root, content);
    const waiver = {
      version: 1,
      justification: "this file is special",
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    expect(runCheck(root, baselineFor(exceptionFor(content, waiver))).errors).toContain(
      `${sourcePath} waiver justification must be exactly ${JSON.stringify(approximateTargetJustification)}`,
    );
  });

  test("rejects extra machinery on the lightweight waiver", () => {
    const root = makeRoot();
    const content = contentWithLines(589);
    writeSource(root, content);
    const waiver = {
      version: 1,
      justification: approximateTargetJustification,
      expiresOn: "2026-12-31",
      followUp: followUpPath,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    expect(runCheck(root, baselineFor(exceptionFor(content, waiver))).errors).toContain(
      `${sourcePath} approximately-500 waiver must not require expiry or follow-up`,
    );
  });

  test("rejects a new module above the hard boundary", () => {
    const root = makeRoot();
    writeSource(root, contentWithLines(601));
    expect(runCheck(root, baselineFor()).errors).toContain(
      `${sourcePath} has 601 lines; hard limit is 600; decompose it or record a versioned coordinator waiver`,
    );
  });

  test("accepts an unchanged digest-pinned legacy exception", () => {
    const root = makeRoot();
    const content = contentWithLines(601);
    writeSource(root, content);
    expect(runCheck(root, baselineFor(exceptionFor(content))).errors).toEqual([]);
  });

  test.each([
    ["growth", 601, 602],
    ["same-size content change", 601, 601],
    ["reduced but still oversized content change", 603, 601],
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
    const original = contentWithLines(601, "original");
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
    const content = contentWithLines(602);
    writeSource(root, content);
    writeFileSync(
      join(root, "packages/llm-core/docs/final-architecture/tasks/decompose-large.md"),
      taskFrontMatter("decompose-large", "ready"),
    );
    const original = contentWithLines(601, "original");
    const waiver = {
      version: 2,
      justification: hardWaiverJustification,
      expiresOn: "2026-12-31",
      followUp: followUpPath,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors).toEqual([]);
  });

  test("rejects a package source delegated to another package's follow-up", () => {
    const root = makeRoot();
    const ownedSourcePath = "packages/example/src/large.ts";
    const content = contentWithLines(602);
    const original = contentWithLines(601, "original");
    mkdirSync(join(root, "packages/example/src"), { recursive: true });
    writeFileSync(join(root, ownedSourcePath), content);
    writeFileSync(join(root, followUpPath), taskFrontMatter());
    const waiver = {
      version: 2,
      justification: hardWaiverJustification,
      expiresOn: "2026-12-31",
      followUp: followUpPath,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    const baseline: SlocBaseline = {
      ...baselineFor(),
      exceptions: { [ownedSourcePath]: exceptionFor(original, waiver) },
    };

    expect(runCheck(root, baseline).errors).toContain(
      `${ownedSourcePath} waiver follow-up must belong to package example, not llm-core`,
    );
  });

  test("allows a repository-level source to reference an explicit package-owned follow-up", () => {
    const root = makeRoot();
    const repositorySourcePath = "scripts/large.ts";
    const content = contentWithLines(602);
    const original = contentWithLines(601, "original");
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, repositorySourcePath), content);
    writeFileSync(
      join(root, followUpPath),
      taskFrontMatter("decompose-large", "proposed", [repositorySourcePath]),
    );
    const waiver = {
      version: 2,
      justification: hardWaiverJustification,
      expiresOn: "2026-12-31",
      followUp: followUpPath,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    const baseline: SlocBaseline = {
      ...baselineFor(),
      exceptions: { [repositorySourcePath]: exceptionFor(original, waiver) },
    };

    expect(runCheck(root, baseline).errors).toEqual([]);
  });

  test("rejects expired waivers and missing follow-ups", () => {
    const root = makeRoot();
    const content = contentWithLines(602);
    writeSource(root, content);
    const original = contentWithLines(601, "original");
    const waiver = {
      version: 1,
      expiresOn: "2026-01-01",
      followUp: "packages/llm-core/docs/final-architecture/tasks/missing-task.md",
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    const errors = runCheck(root, baselineFor(exceptionFor(original, waiver))).errors;
    expect(errors.join("\n")).toContain("waiver expired");
    expect(errors.join("\n")).toContain("waiver follow-up must be a non-symlink regular file");
  });

  test("requires the explicit follow-up path to name a file", () => {
    const root = makeRoot();
    const content = contentWithLines(602);
    const original = contentWithLines(601, "original");
    writeSource(root, content);
    const directoryPath = "packages/llm-core/docs/final-architecture/tasks/directory.md";
    mkdirSync(join(root, directoryPath));
    const waiver = {
      version: 2,
      expiresOn: "2026-12-31",
      followUp: directoryPath,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };

    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors).toContain(
      `${sourcePath} waiver follow-up must be a non-symlink regular file within its package docs task boundary`,
    );
  });

  test.each([
    ["a package README", "packages/llm-core/docs/README.md"],
    ["an archived changelog", "packages/llm-core/docs/v1-changelog.md"],
    ["a non-task architecture document", "packages/llm-core/docs/final-architecture/ROADMAP.md"],
    ["a tasks README", "packages/llm-core/docs/final-architecture/tasks/README.md"],
  ])("rejects %s as a waiver follow-up", (_label, followUp) => {
    const root = makeRoot();
    const content = contentWithLines(602);
    const original = contentWithLines(601, "original");
    writeSource(root, content);
    const waiver = {
      version: 2,
      expiresOn: "2026-12-31",
      followUp,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };

    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors).toContain(
      `${sourcePath} waiver followUp must be a normalized repository-relative task path under packages/<owner>/docs/**/tasks/`,
    );
  });

  test("rejects a task whose front-matter id does not match its filename", () => {
    const root = makeRoot();
    const content = contentWithLines(602);
    const original = contentWithLines(601, "original");
    writeSource(root, content);
    writeFileSync(join(root, followUpPath), taskFrontMatter("another-task"));
    const waiver = {
      version: 2,
      expiresOn: "2026-12-31",
      followUp: followUpPath,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };

    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors).toContain(
      `${sourcePath} waiver follow-up id must match its filename`,
    );
  });

  test("rejects a same-package follow-up that does not own the waived source", () => {
    const root = makeRoot();
    const content = contentWithLines(602);
    const original = contentWithLines(601, "original");
    writeSource(root, content);
    writeFileSync(
      join(root, followUpPath),
      taskFrontMatter("decompose-large", "proposed", ["packages/llm-core/src/other/**"]),
    );
    const waiver = {
      version: 2,
      justification: hardWaiverJustification,
      expiresOn: "2026-12-31",
      followUp: followUpPath,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };

    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors).toContain(
      `${sourcePath} waiver follow-up write_scope does not own the waived source`,
    );
  });

  test("rejects a task without valid front matter", () => {
    const root = makeRoot();
    const content = contentWithLines(602);
    const original = contentWithLines(601, "original");
    writeSource(root, content);
    writeFileSync(join(root, followUpPath), "# Decompose large\n");
    const waiver = {
      version: 2,
      expiresOn: "2026-12-31",
      followUp: followUpPath,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };

    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors).toContain(
      `${sourcePath} waiver follow-up must have canonical front matter with unique id, status and write_scope fields`,
    );
  });

  test.each(["done", "cancelled"])(
    "rejects a follow-up task with non-actionable status %s",
    (status) => {
      const root = makeRoot();
      const content = contentWithLines(602);
      const original = contentWithLines(601, "original");
      writeSource(root, content);
      writeFileSync(join(root, followUpPath), taskFrontMatter("decompose-large", status));
      const waiver = {
        version: 2,
        expiresOn: "2026-12-31",
        followUp: followUpPath,
        currentLines: physicalSourceLines(content),
        currentSha256: sourceDigest(content),
      };

      expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors).toContain(
        `${sourcePath} waiver follow-up status must be actionable: proposed, ready, claimed, in_progress, review, or blocked`,
      );
    },
  );

  test.each([
    ["an id-only stub", "---\nid: decompose-large\n---\n"],
    ["a duplicate id", "---\nid: decompose-large\nid: decompose-large\nstatus: proposed\n---\n"],
    ["a duplicate status", "---\nid: decompose-large\nstatus: proposed\nstatus: claimed\n---\n"],
    ["a malformed field", "---\nid: decompose-large\nstatus proposed\n---\n"],
  ])("rejects %s as task front matter", (_label, frontMatter) => {
    const root = makeRoot();
    const content = contentWithLines(602);
    const original = contentWithLines(601, "original");
    writeSource(root, content);
    writeFileSync(join(root, followUpPath), frontMatter);
    const waiver = {
      version: 2,
      expiresOn: "2026-12-31",
      followUp: followUpPath,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };

    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors).toContain(
      `${sourcePath} waiver follow-up must have canonical front matter with unique id, status and write_scope fields`,
    );
  });

  test("rejects impossible waiver calendar dates", () => {
    const root = makeRoot();
    const content = contentWithLines(602);
    writeSource(root, content);
    const original = contentWithLines(601, "original");
    const waiver = {
      version: 1,
      expiresOn: "2026-99-99",
      followUp: followUpPath,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };
    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors.join("\n")).toContain(
      "valid YYYY-MM-DD date",
    );
  });

  test.each([
    "/packages/example/docs/final-architecture/tasks/decompose-large.md",
    "../packages/example/docs/final-architecture/tasks/decompose-large.md",
    "packages/example/docs/../decompose-large.md",
    "packages\\example\\docs\\final-architecture\\tasks\\decompose-large.md",
    "packages/example/docs/final-architecture/tasks/decompose-large.txt",
    "decompose-large",
  ])("rejects unsafe or malformed follow-up path %s", (followUp) => {
    const root = makeRoot();
    const content = contentWithLines(602);
    const original = contentWithLines(601, "original");
    writeSource(root, content);
    const waiver = {
      version: 2,
      expiresOn: "2026-12-31",
      followUp,
      currentLines: physicalSourceLines(content),
      currentSha256: sourceDigest(content),
    };

    expect(runCheck(root, baselineFor(exceptionFor(original, waiver))).errors).toContain(
      `${sourcePath} waiver followUp must be a normalized repository-relative task path under packages/<owner>/docs/**/tasks/`,
    );
  });

  test("rejects a changed source and rewritten legacy exception without a waiver", () => {
    const root = makeRoot();
    const original = contentWithLines(601, "original");
    const trusted = baselineFor(exceptionFor(original));
    const changed = contentWithLines(602, "changed");
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
    const content = contentWithLines(601);
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

  test("rejects source-extension symbolic links instead of silently skipping them", () => {
    const root = makeRoot();
    const target = join(root, "source-target.txt");
    const link = join(root, "packages/llm-core/src/linked.ts");
    writeFileSync(target, contentWithLines(20));
    symlinkSync(target, link);

    expect(runCheck(root, baselineFor()).errors).toContain(
      "packages/llm-core/src/linked.ts is a symbolic link; symbolic links are not allowed in the measured tree",
    );
  });

  test("rejects symbolic-link directories that could hide oversized sources", () => {
    const root = makeRoot();
    const target = join(root, "source-target");
    mkdirSync(target);
    writeFileSync(join(target, "large.ts"), contentWithLines(601));
    symlinkSync(target, join(root, "packages/llm-core/src/linked"));

    expect(runCheck(root, baselineFor()).errors).toContain(
      "packages/llm-core/src/linked is a symbolic link; symbolic links are not allowed in the measured tree",
    );
  });

  test.each(["file", "parent directory"])(
    "rejects an external follow-up reached by a %s symlink",
    (kind) => {
      const root = makeRoot();
      const external = mkdtempSync(join(tmpdir(), "llm-core-sloc-external-"));
      roots.push(external);
      writeSource(root, contentWithLines(602));
      writeFileSync(join(external, "decompose-large.md"), taskFrontMatter());
      const task = join(root, followUpPath);
      if (kind === "file") symlinkSync(join(external, "decompose-large.md"), task);
      else {
        rmSync(join(task, ".."), { recursive: true });
        symlinkSync(external, join(task, ".."));
      }
      const waiver = {
        version: 2,
        expiresOn: "2026-12-31",
        followUp: followUpPath,
        currentLines: 602,
        currentSha256: sourceDigest(contentWithLines(602)),
      };
      const errors = runCheck(
        root,
        baselineFor(exceptionFor(contentWithLines(601), waiver)),
      ).errors;
      expect(errors.join("\n")).toContain(
        "non-symlink regular file within its package docs task boundary",
      );
    },
  );

  test("keeps source-extension symbolic links under excluded directories excluded", () => {
    const root = makeRoot();
    const target = join(root, "source-target.txt");
    const excluded = join(root, "generated/linked.ts");
    writeFileSync(target, contentWithLines(20));
    mkdirSync(join(root, "generated"), { recursive: true });
    symlinkSync(target, excluded);

    expect(runCheck(root, baselineFor()).errors).toEqual([]);
  });

  test("rejects a changed version-1 target and still enforces the hard boundary", () => {
    const root = makeRoot();
    writeSource(root, contentWithLines(601));
    const baseline = { ...baselineFor(), limit: 1_000_000 };
    const errors = runCheck(root, baseline).errors.join("\n");
    expect(errors).toContain("version 1 limit must be exactly 500");
    expect(errors).toContain(`${sourcePath} has 601 lines; hard limit is 600`);
  });

  test("rejects broadened exclusions and scans with the canonical policy", () => {
    const root = makeRoot();
    writeSource(root, contentWithLines(601));
    const baseline = {
      ...baselineFor(),
      excludedDirectories: [...slocV1Policy.excludedDirectories, "packages"],
    };
    const errors = runCheck(root, baseline).errors.join("\n");
    expect(errors).toContain("excludedDirectories must match the canonical policy");
    expect(errors).toContain(`${sourcePath} has 601 lines; hard limit is 600`);
  });

  test("rejects removal of an entry from the sealed legacy set", () => {
    const root = makeRoot();
    const content = contentWithLines(601);
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
