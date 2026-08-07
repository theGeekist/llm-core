import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseArchitectureTask,
  scopesOverlap,
  type ArchitectureTask,
} from "./architecture-task-plan";
import { taskPlanConfiguration, type TaskStatus } from "./architecture-task-plan.config";
import {
  validateRequiredReading,
  validateTaskReadings,
  type RequiredReading,
} from "./architecture-task-reading";

const git = (cwd: string, ...arguments_: string[]): string => {
  const result = Bun.spawnSync(["git", ...arguments_], { cwd, stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
};

interface ValidateFixtureOptions {
  readonly reading: readonly RequiredReading[];
  readonly readScope: readonly string[];
  readonly status?: TaskStatus;
  readonly workspaceRoot?: string;
}

const validate = ({
  reading,
  readScope,
  status = "proposed",
  workspaceRoot = process.cwd(),
}: ValidateFixtureOptions): readonly string[] =>
  validateRequiredReading({
    configuration: taskPlanConfiguration,
    reading,
    readScope,
    scopeAliases: [],
    scopesOverlap,
    source: "tasks/context.md",
    status,
    workspaceRoot,
  });

const task = (
  requiredReading: readonly RequiredReading[],
  readScope: readonly string[],
): ArchitectureTask => ({
  authority: "llm-core",
  conflictsWith: [],
  decisionDependencies: [],
  declaredPriority: "normal",
  dependsOn: [],
  effectivePriority: "normal",
  id: "fixture",
  key: "llm-core/fixture",
  path: "tasks/fixture.md",
  readScope,
  requiredReading,
  status: "proposed",
  title: "fixture",
  writeScope: ["tasks/fixture.md"],
});

const filesystemFixture = <Result>(run: (root: string) => Result): Result => {
  const root = mkdtempSync(join(tmpdir(), "architecture-reading-"));
  try {
    return run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
};

describe("required reading parsing", () => {
  const document = (requiredReading: string): string =>
    `---\nid: contextual\nstatus: proposed\nwrite_scope:\n  - tasks/contextual.md\nread_scope:\n  - packages/llm-core/docs/**\n${requiredReading}\n---\n# Contextual\n`;

  test("preserves ordered contextual reading and optional revisions", () => {
    const parsed = parseArchitectureTask({
      authority: "llm-core",
      content: document(`required_reading:
  - path: packages/llm-core/docs/final-architecture/PLAN.md
    reason: Preserve the completed boundary.
    ref: 8844ac3989e497a762fa43f23fd93e40803d2174
  - path: packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
    reason: Preserve review caveats.`),
      path: "tasks/contextual.md",
    });
    expect(parsed.requiredReading.map(({ path, ref }) => [path, ref])).toEqual([
      [
        "packages/llm-core/docs/final-architecture/PLAN.md",
        "8844ac3989e497a762fa43f23fd93e40803d2174",
      ],
      ["packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md", null],
    ]);
  });

  test("rejects missing, duplicate, globbed and traversing entries", () => {
    for (const [requiredReading, message] of [
      ["required_reading: []", taskPlanConfiguration.messages.errors.missingReading],
      [
        "required_reading:\n  - path: packages/llm-core/docs/**\n    reason: Too broad.",
        taskPlanConfiguration.messages.errors.invalidReadingPath,
      ],
      [
        "required_reading:\n  - path: README.md\n    reason: One.\n  - path: README.md\n    reason: Two.",
        taskPlanConfiguration.messages.errors.duplicateReading,
      ],
      [
        "required_reading:\n  - path: context/simple-chat/../README.md\n    reason: Escape.",
        taskPlanConfiguration.messages.errors.invalidReadingPath,
      ],
    ] as const) {
      expect(() =>
        parseArchitectureTask({
          authority: "llm-core",
          content: document(requiredReading),
          path: "tasks/contextual.md",
        }),
      ).toThrow(message);
    }
  });

  test("rejects duplicate path and reason keys inside required reading entries", () => {
    for (const [requiredReading, field] of [
      [
        "required_reading:\n  - path: README.md\n    path: packages/llm-core/README.md\n    reason: Duplicate path.",
        "path",
      ],
      [
        "required_reading:\n  - path: README.md\n    reason: First reason.\n    reason: Second reason.",
        "reason",
      ],
    ] as const) {
      expect(() =>
        parseArchitectureTask({
          authority: "llm-core",
          content: document(requiredReading),
          path: "tasks/contextual.md",
        }),
      ).toThrow(`${taskPlanConfiguration.messages.errors.duplicateReadingField} ${field}`);
    }
  });
});

describe("required reading provenance", () => {
  test("validates current, aliased and public revision-pinned files", () => {
    const publicRef = git(process.cwd(), "rev-parse", "HEAD");
    expect(() =>
      validate({
        reading: [
          { path: "README.md", reason: "Repository boundary.", ref: null },
          {
            path: "context/aifsd-research/AUTHORITY.md",
            reason: "Research authority.",
            ref: null,
          },
          {
            path: "packages/llm-core/README.md",
            reason: "Pinned package boundary.",
            ref: publicRef,
          },
        ],
        readScope: ["README.md", "context/aifsd-research/**", "packages/llm-core/**"],
      }),
    ).not.toThrow();
  });

  test("resolves packages/aifsd/docs pins relative to the private repository root", () => {
    const privateRoot = join(process.cwd(), "context/aifsd-research");
    const privateRef = git(privateRoot, "rev-parse", "HEAD");
    expect(() =>
      validate({
        reading: [
          {
            path: "packages/aifsd/docs/final-architecture/README.md",
            reason: "Pinned private product authority.",
            ref: privateRef,
          },
        ],
        readScope: ["packages/aifsd/docs/**"],
      }),
    ).not.toThrow();
  });

  test("requires the ref to be a commit and ref:path to be a Git blob", () => {
    const root = process.cwd();
    const commit = git(root, "rev-parse", "HEAD");
    const blob = git(root, "rev-parse", "HEAD:README.md");
    expect(() =>
      validate({
        reading: [{ path: "README.md", reason: "Blob ref masquerading as commit.", ref: blob }],
        readScope: ["README.md"],
      }),
    ).toThrow(taskPlanConfiguration.messages.errors.invalidReadingRevision);
    expect(() =>
      validate({
        reading: [
          {
            path: "packages/llm-core/docs/final-architecture",
            reason: "A tree is not a file.",
            ref: commit,
          },
        ],
        readScope: ["packages/llm-core/docs/**"],
      }),
    ).toThrow(taskPlanConfiguration.messages.errors.invalidReadingObject);
  });

  test("rejects an annotated tag object ID instead of peeling it to a commit", () => {
    filesystemFixture((workspaceRoot) => {
      git(workspaceRoot, "init", "--quiet");
      git(workspaceRoot, "config", "user.email", "planner@example.invalid");
      git(workspaceRoot, "config", "user.name", "Planner Fixture");
      writeFileSync(join(workspaceRoot, "README.md"), "fixture\n");
      git(workspaceRoot, "add", "README.md");
      git(workspaceRoot, "commit", "--quiet", "-m", "fixture");
      git(workspaceRoot, "tag", "-a", "fixture-tag", "-m", "annotated fixture");
      const tagObject = git(workspaceRoot, "rev-parse", "refs/tags/fixture-tag");
      expect(git(workspaceRoot, "cat-file", "-t", tagObject)).toBe("tag");
      expect(() =>
        validate({
          reading: [{ path: "README.md", reason: "Annotated tag object.", ref: tagObject }],
          readScope: ["README.md"],
          workspaceRoot,
        }),
      ).toThrow(taskPlanConfiguration.messages.errors.invalidReadingRevision);
      expect(() =>
        validate({
          reading: [
            {
              path: "README.md",
              reason: "Exact commit object.",
              ref: git(workspaceRoot, "rev-parse", "HEAD"),
            },
          ],
          readScope: ["README.md"],
          workspaceRoot,
        }),
      ).not.toThrow();
    });
  });

  test("permits configured mutable Simple Chat context in every lifecycle", () => {
    const reading = [
      { path: "context/simple-chat/README.md", reason: "Current consumer evidence.", ref: null },
    ];
    for (const status of taskPlanConfiguration.lifecycle.allowed) {
      expect(() =>
        validate({ readScope: ["context/simple-chat/**"], reading, status }),
      ).not.toThrow();
    }
    const simpleChatRoot = join(process.cwd(), "context/simple-chat");
    const simpleChatRef = git(simpleChatRoot, "rev-parse", "HEAD");
    expect(() =>
      validate({
        reading: [
          {
            path: "context/simple-chat/README.md",
            reason: "Immutable consumer evidence.",
            ref: simpleChatRef,
          },
        ],
        readScope: ["context/simple-chat/**"],
        status: "done",
      }),
    ).not.toThrow();
  });

  test("rejects uncovered, missing and escaping current files", () => {
    expect(() =>
      validate({
        reading: [{ path: "README.md", reason: "Outside scope.", ref: null }],
        readScope: ["packages/**"],
      }),
    ).toThrow(taskPlanConfiguration.messages.errors.readingOutsideScope);
    expect(() =>
      validate({
        reading: [{ path: "missing.md", reason: "Missing.", ref: null }],
        readScope: ["missing.md"],
      }),
    ).toThrow(taskPlanConfiguration.messages.errors.missingReadingPath);
    filesystemFixture((workspaceRoot) => {
      mkdirSync(join(workspaceRoot, "context/simple-chat"), { recursive: true });
      writeFileSync(join(workspaceRoot, "outside.md"), "outside");
      symlinkSync("../../outside.md", join(workspaceRoot, "context/simple-chat/escape.md"));
      expect(() =>
        validate({
          reading: [{ path: "context/simple-chat/escape.md", reason: "Escape.", ref: null }],
          readScope: ["context/simple-chat/**"],
          workspaceRoot,
        }),
      ).toThrow(taskPlanConfiguration.messages.errors.readingOutsideSource);
    });
  });

  test("returns only unavailable sources actually referenced by tasks", () => {
    filesystemFixture((workspaceRoot) => {
      writeFileSync(join(workspaceRoot, "README.md"), "fixture");
      expect(
        validateTaskReadings({
          scopesOverlap,
          tasks: [task([{ path: "README.md", reason: "Fixture.", ref: null }], ["README.md"])],
          workspaceRoot,
        }),
      ).toEqual([]);
      expect(
        validateTaskReadings({
          scopesOverlap,
          tasks: [
            task(
              [
                {
                  path: "context/simple-chat/evidence.md",
                  reason: "Unavailable fixture.",
                  ref: null,
                },
              ],
              ["context/simple-chat/**"],
            ),
          ],
          workspaceRoot,
        }),
      ).toEqual(["context/simple-chat"]);
    });
  });
});
