import { describe, expect, test } from "bun:test";
import {
  parsePublicProjection,
  publicBoundaryViolations,
  type PublicProjection,
} from "./check-public-boundary";

const projection: PublicProjection = {
  version: 1,
  aifsdExactPaths: [
    "packages/aifsd/CHANGELOG.md",
    "packages/aifsd/README.md",
    "packages/aifsd/internal/typecheck-root.d.ts",
    "packages/aifsd/package.json",
    "packages/aifsd/tsconfig.json",
  ],
  aifsdCodeRoots: [
    "packages/aifsd/changes",
    "packages/aifsd/releases",
    "packages/aifsd/scripts",
    "packages/aifsd/src",
    "packages/aifsd/tests",
  ],
  aifsdPublicDocuments: ["docs/aifsd/getting-started.md"],
};

describe("public repository boundary", () => {
  test("rejects private AIFSD mounts, validators, and authorities", () => {
    const paths = [
      "packages/aifsd/docs",
      "packages/aifsd/docs/final-architecture/STATUS.md",
      "packages/aifsd/scripts/validate-architecture.ts",
      "packages/aifsd/scripts/validate-architecture-markdown.ts",
      "packages/aifsd/architecture/decisions/ADR-009-public-sdk.md",
      "packages/aifsd/internal/architecture/tasks/public-transition.md",
      "packages/aifsd/STATUS.md",
      "product/aifsd/docs/final-architecture/README.md",
    ];

    expect(publicBoundaryViolations(paths, projection).map(({ path }) => path)).toEqual(paths);
  });

  test("allows public package code, technical internals, and adoption documentation", () => {
    expect(
      publicBoundaryViolations(
        [
          "AGENTS.md",
          "docs/aifsd/getting-started.md",
          "packages/aifsd/CHANGELOG.md",
          "packages/aifsd/changes/pending/aifsd-config-integrations-candidate.json",
          "packages/aifsd/README.md",
          "packages/aifsd/internal/typecheck-root.d.ts",
          "packages/aifsd/releases/0.1.0/plan.json",
          "packages/aifsd/scripts/check-api-surface.ts",
          "packages/aifsd/src/tasks/public.ts",
          "packages/aifsd/tests/tasks.test.ts",
          "packages/llm-core/docs/internal/STYLE.md",
        ],
        projection,
      ),
    ).toEqual([]);
  });

  test("does not reject similarly named paths outside the private projection", () => {
    expect(
      publicBoundaryViolations(
        [
          "docs/product/aifsd.md",
          "examples/product/aifsd/index.ts",
          "packages/other/docs/final-architecture/STATUS.md",
        ],
        projection,
      ),
    ).toEqual([]);
  });

  test("rejects undeclared AIFSD package paths and public documents", () => {
    const paths = [
      "docs/aifsd/private-architecture.md",
      "packages/aifsd/INTERNAL-NOTES.md",
      "packages/aifsd/examples/private-demo.ts",
    ];

    expect(publicBoundaryViolations(paths, projection).map(({ path }) => path)).toEqual(paths);
  });

  test("rejects malformed, duplicate, and unsorted projection entries", () => {
    expect(() => parsePublicProjection("{}")).toThrow("unsupported shape or version");
    expect(() =>
      parsePublicProjection(
        JSON.stringify({
          ...projection,
          aifsdExactPaths: ["packages/aifsd/package.json", "packages/aifsd/package.json"],
        }),
      ),
    ).toThrow("must not contain duplicate paths");
    expect(() =>
      parsePublicProjection(
        JSON.stringify({
          ...projection,
          aifsdCodeRoots: ["packages/aifsd/tests", "packages/aifsd/src"],
        }),
      ),
    ).toThrow("must be sorted");
  });
});
