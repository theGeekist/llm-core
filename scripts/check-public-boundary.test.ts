import { describe, expect, test } from "bun:test";
import { publicBoundaryViolations } from "./check-public-boundary";

describe("public repository boundary", () => {
  test("rejects local guidance, private AIFSD mounts, validators, and authorities", () => {
    const paths = [
      "AGENTS.md",
      "packages/aifsd/docs",
      "packages/aifsd/docs/final-architecture/STATUS.md",
      "packages/aifsd/scripts/validate-architecture.ts",
      "packages/aifsd/scripts/validate-architecture-markdown.ts",
      "packages/aifsd/architecture/decisions/ADR-009-public-sdk.md",
      "packages/aifsd/internal/architecture/tasks/public-transition.md",
      "packages/aifsd/STATUS.md",
      "product/aifsd/docs/final-architecture/README.md",
    ];

    expect(publicBoundaryViolations(paths).map(({ path }) => path)).toEqual(paths);
  });

  test("allows public package code, technical internals, and adoption documentation", () => {
    expect(
      publicBoundaryViolations([
        "docs/aifsd/getting-started.md",
        "packages/aifsd/README.md",
        "packages/aifsd/internal/typecheck-root.d.ts",
        "packages/aifsd/scripts/check-api-surface.ts",
        "packages/aifsd/src/tasks/public.ts",
        "packages/aifsd/tests/tasks.test.ts",
        "packages/llm-core/docs/internal/STYLE.md",
      ]),
    ).toEqual([]);
  });

  test("does not reject similarly named paths outside the private projection", () => {
    expect(
      publicBoundaryViolations([
        "docs/product/aifsd.md",
        "examples/product/aifsd/index.ts",
        "packages/other/docs/final-architecture/STATUS.md",
      ]),
    ).toEqual([]);
  });
});
