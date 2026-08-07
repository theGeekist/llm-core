import { describe, expect, test } from "bun:test";
import { createArchitectureTaskPlan, type ArchitectureTask } from "./architecture-task-plan";
import { canonicalScope, scopesOverlap } from "./architecture-task-scope";

const candidate = (writeScope: readonly string[]): ArchitectureTask => ({
  authority: "llm-core",
  conflictsWith: [],
  decisionDependencies: [],
  declaredPriority: "critical",
  dependsOn: [],
  effectivePriority: "critical",
  id: "candidate",
  key: "llm-core/candidate",
  path: "tasks/candidate.md",
  readScope: ["README.md"],
  requiredReading: [{ path: "README.md", reason: "Fixture.", ref: null }],
  status: "proposed",
  title: "candidate",
  writeScope,
});

describe("architecture task scope overlap", () => {
  test("matches exact paths only when both scopes are exact", () => {
    expect(scopesOverlap("src/file.ts", "src/file.ts")).toBeTrue();
    expect(scopesOverlap("src/file.ts", "src/other.ts")).toBeFalse();
    expect(scopesOverlap("src/directory", "src/directory/file.ts")).toBeFalse();
  });

  test("matches filename-prefix and directory globs against exact paths", () => {
    expect(
      scopesOverlap(
        "packages/aifsd/docs/final-architecture/tasks/clients-*.md",
        "packages/aifsd/docs/final-architecture/tasks/clients-mobile-foundation.md",
      ),
    ).toBeTrue();
    expect(
      scopesOverlap("packages/llm-core/tsconfig*.json", "packages/llm-core/tsconfig.json"),
    ).toBeTrue();
    expect(scopesOverlap("src/*.ts", "src/nested/file.ts")).toBeFalse();
    expect(scopesOverlap("src/**", "src/nested/file.ts")).toBeTrue();
  });

  test("conservatively detects intersecting globs and rejects incompatible prefixes", () => {
    expect(scopesOverlap("src/client-*.ts", "src/client-mobile*.ts")).toBeTrue();
    expect(scopesOverlap("src/**/public.ts", "src/features/**")).toBeTrue();
    expect(scopesOverlap("src/client-*.ts", "tests/client-*.ts")).toBeFalse();
    expect(scopesOverlap("src/alpha/**", "src/beta/**")).toBeFalse();
  });

  test("canonicalises the longest matching physical alias", () => {
    const aliases = [
      { logical: "context/aifsd-research", physical: "/private/research" },
      {
        logical: "packages/aifsd/docs",
        physical: "/private/research/product/aifsd/docs",
      },
    ];
    expect(canonicalScope("/private/research/product/aifsd/docs/README.md", aliases)).toBe(
      "packages/aifsd/docs/README.md",
    );
    expect(
      scopesOverlap(
        "packages/aifsd/docs/final-architecture/**",
        "/private/research/product/aifsd/docs/final-architecture/STATUS.md",
        aliases,
      ),
    ).toBeTrue();
  });

  test("blocks dirty paths matched through filename-prefix globs", async () => {
    const plan = await createArchitectureTaskPlan({
      dirtyPaths: ["packages/llm-core/tsconfig.build.json"],
      tasks: [candidate(["packages/llm-core/tsconfig*.json"])],
    });
    expect(plan.candidates[0]?.canStart).toBeFalse();
    expect(plan.candidates[0]?.safetyBlockers).toEqual([
      "write scope contains dirty path packages/llm-core/tsconfig.build.json",
    ]);
  });
});
