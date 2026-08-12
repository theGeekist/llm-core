import { describe, expect, test } from "bun:test";
import { parseTaskBrief } from "./task-brief";

describe("task brief", () => {
  test("extracts the task narrative and evidence-bearing lists", () => {
    const brief = parseTaskBrief(`---
id: example
---

# example

## Objective

Build the useful thing.

## Why this exists

Titles are not task briefs.

## In scope

- The task narrative.
- Its acceptance evidence.

## Acceptance criteria

- The objective is visible.
- The source document remains authoritative.

## Work log

Not started.
`);

    expect(brief.objective).toBe("Build the useful thing.");
    expect(brief.why).toBe("Titles are not task briefs.");
    expect(brief.inScope).toEqual(["The task narrative.", "Its acceptance evidence."]);
    expect(brief.acceptanceCriteria).toEqual([
      "The objective is visible.",
      "The source document remains authoritative.",
    ]);
    expect(brief.workLog).toBe("Not started.");
  });
});
