import { describe, expect, test } from "bun:test";
import {
  parseSpecKitWorkflow,
  parseSpecKitWorkflowOverlay,
  type SpecKitFile,
} from "../../../src/adapters/spec-kit/public";
import {
  fixture,
  importedFiles,
  importedSources,
  provenance,
  workflowOverlayFile,
} from "./spec-kit-test-fixtures";

describe("Spec Kit adapter", () => {
  test("parses the byte-pinned core schema-v1.0 workflow without flattening gates", () => {
    const result = parseSpecKitWorkflow(fixture("workflow-core-c0fe0e4.yml"));

    expect(result.issues.map((issue) => issue.disposition)).toEqual(["preserved"]);
    expect(result.program).toMatchObject({
      schemaVersion: "1.0",
      workflowId: "speckit",
      name: "Full SDD Cycle",
      version: "1.0.0",
    });
    expect(result.program?.steps.map((step) => [step.stepId, step.type])).toEqual([
      ["specify", "command"],
      ["review-spec", "gate"],
      ["plan", "command"],
      ["review-plan", "gate"],
      ["tasks", "command"],
      ["implement", "command"],
    ]);
    expect(result.program?.steps[1]?.gate).toEqual({
      message: "Review the generated spec before planning.",
      options: ["approve", "reject"],
      onReject: "abort",
    });
    expect(result.program?.definition.requires).toEqual({
      speckit_version: ">=0.8.5",
      integrations: { any: ["claude", "copilot", "gemini", "opencode"] },
    });
    expect(Object.isFrozen(result.program?.definition)).toBe(true);
  });

  test("preserves nested conditions, switch branches, loop bounds, gates, fan-out, and fan-in", () => {
    const result = parseSpecKitWorkflow(fixture("workflow-control-flow-c0fe0e4.yml"));
    const program = result.program!;
    const choose = program.steps[0]!;

    expect(choose.then?.[0]).toMatchObject({
      stepId: "retry",
      type: "while",
      loop: { maxIterations: 4 },
    });
    expect(choose.then?.[0]?.loop?.steps[0]).toMatchObject({ stepId: "check", type: "shell" });
    expect(choose.else?.[0]?.cases?.full?.[0]).toMatchObject({
      stepId: "full",
      type: "prompt",
    });
    expect(choose.else?.[0]?.default?.[0]).toMatchObject({ stepId: "narrow" });
    expect(program.steps[1]?.gate).toMatchObject({ onReject: "retry" });
    expect(program.steps[2]?.loop).toMatchObject({ maxIterations: 3 });
    expect(program.steps[3]?.fanOut).toMatchObject({
      maxConcurrency: 2,
      step: { stepId: "inspect", type: "prompt" },
    });
    expect(program.steps[4]?.fanIn).toEqual({
      waitFor: ["parallel"],
      output: { reports: "{{ fan_in.results }}" },
    });
  });

  test("parses the byte-captured installed native overlay and all qualified edit forms", () => {
    const result = parseSpecKitWorkflowOverlay(fixture("workflow-overlay-installed-c0fe0e4.yml"));

    expect(result.issues.map((issue) => issue.disposition)).toEqual(["preserved"]);
    expect(result.program).toMatchObject({
      overlayId: "review-hardening",
      extendsWorkflowId: "speckit",
      priority: 5,
      enabled: true,
      edits: [
        {
          operation: "insert_after",
          anchor: "review-spec",
          step: { id: "security-review", type: "prompt" },
        },
        { operation: "remove", anchor: "review-plan" },
      ],
    });
    expect(result.program?.definition.schema_version).toBeUndefined();

    const allForms = parseSpecKitWorkflowOverlay(`
id: all-forms
extends: speckit
priority: 5.9
enabled: false
edits:
  - insert_before: first
    step: { id: before, type: shell }
  - operation: insert_after
    anchor: first
    step: { id: after, type: shell }
  - replace: second
    step: { id: replacement, type: prompt }
  - operation: remove
    anchor: third
`);
    expect(allForms.program).toMatchObject({
      overlayId: "all-forms",
      extendsWorkflowId: "speckit",
      priority: 5,
      enabled: false,
      edits: [
        { operation: "insert_before", anchor: "first", step: { id: "before" } },
        { operation: "insert_after", anchor: "first", step: { id: "after" } },
        { operation: "replace", anchor: "second", step: { id: "replacement" } },
        { operation: "remove", anchor: "third" },
      ],
    });
  });

  test("rejects empty or malformed overlay edits and caller provenance mismatches", () => {
    const invalidOverlays = [
      `id: review\nextends: speckit\nedits: []`,
      `id: review\nextends: speckit\nedits:\n  - remove: a\n    step: { id: b }`,
      `id: review\nextends: speckit\nedits:\n  - insert_after: a\n    operation: remove`,
      `id: review\nextends: speckit\nedits:\n  - replace: a\n    step: { id: "nested:id" }`,
    ];
    invalidOverlays.forEach((content) => {
      const parsed = parseSpecKitWorkflowOverlay(content);
      expect(parsed.program).toBeUndefined();
      expect(parsed.issues.some((issue) => issue.disposition === "rejected")).toBe(true);
    });

    const mismatchedProvenance = [
      { providerId: "project:wrong-id" },
      { resolutionScope: "workflow:wrong-target" },
      { priority: 6 },
      { strategy: "replace" as const },
    ];
    mismatchedProvenance.forEach((mismatch) => {
      expect(() =>
        importedFiles([
          {
            path: ".specify/workflows/overlays/speckit/review-hardening.yml",
            content: fixture("workflow-overlay-installed-c0fe0e4.yml"),
            kind: "overlay",
            provenance: {
              ...provenance("workflow-overlay", "project:review-hardening", 0, {
                resolutionScope: "workflow:speckit",
                priority: 5,
              }),
              ...mismatch,
            },
          },
        ]),
      ).toThrow("must match native identity, target, and normalized priority");
    });

    expect(() =>
      importedFiles([
        workflowOverlayFile("valid-anchor", 5, true, 0),
        {
          path: ".specify/workflows/speckit/workflow.yml",
          content: fixture("workflow-core-c0fe0e4.yml"),
          kind: "workflow",
          provenance: provenance("core", "speckit", 1, {
            resolutionScope: "workflow:speckit",
          }),
        },
      ]),
    ).not.toThrow();

    const unknownAnchorSource = workflowOverlayFile("unknown-anchor", 5, true, 0);
    const unknownAnchor = {
      ...unknownAnchorSource,
      content: unknownAnchorSource.content.replace("review-plan", "does-not-exist"),
    };
    expect(() =>
      importedFiles([
        unknownAnchor,
        {
          path: ".specify/workflows/speckit/workflow.yml",
          content: fixture("workflow-core-c0fe0e4.yml"),
          kind: "workflow",
          provenance: provenance("core", "speckit", 1, {
            resolutionScope: "workflow:speckit",
          }),
        },
      ]),
    ).toThrow("no matching base step ID");
  });

  test("validates native workflow scope order across source groups", () => {
    const base: SpecKitFile = {
      path: ".specify/workflows/speckit/workflow.yml",
      content: fixture("workflow-core-c0fe0e4.yml"),
      kind: "workflow",
      provenance: provenance("core", "speckit", 3, {
        resolutionScope: "workflow:speckit",
      }),
    };
    const accepted = importedSources([
      {
        sourceId: "spec-kit.base-and-late",
        revision: "git:base",
        role: "primary",
        authority: "authoritative",
        files: [base, workflowOverlayFile("zulu", 20, true, 2)],
      },
      {
        sourceId: "spec-kit.early",
        revision: "git:overlays",
        role: "overlay",
        authority: "advisory",
        files: [
          workflowOverlayFile("disabled", 1, false, 0),
          workflowOverlayFile("alpha", 5, true, 0),
          workflowOverlayFile("bravo", 5, true, 1),
        ],
      },
    ]);
    expect(accepted.report.fidelity).toBe("exact");

    const malformedDisabled = {
      ...workflowOverlayFile("ignored", 1, false, 99),
      content: `id: INVALID\nextends: nope\nenabled: false\nedits: []\n`,
    };
    expect(() =>
      importedSources([
        {
          sourceId: "spec-kit.disabled",
          revision: "git:disabled",
          role: "overlay",
          authority: "advisory",
          files: [malformedDisabled, workflowOverlayFile("alpha", 5, true, 0)],
        },
      ]),
    ).not.toThrow();

    const invalidOrders = [
      [workflowOverlayFile("late", 20, true, 0), workflowOverlayFile("early", 5, true, 1)],
      [workflowOverlayFile("zulu", 5, true, 0), workflowOverlayFile("alpha", 5, true, 1)],
    ];
    invalidOrders.forEach((files) => {
      expect(() =>
        importedSources([
          {
            sourceId: "spec-kit.invalid-order",
            revision: "git:invalid",
            role: "overlay",
            authority: "advisory",
            files,
          },
        ]),
      ).toThrow("priority and source ascending");
    });

    expect(() =>
      importedSources([
        {
          sourceId: "spec-kit.invalid-base",
          revision: "git:invalid",
          role: "primary",
          authority: "authoritative",
          files: [
            { ...base, provenance: { ...base.provenance, order: 0 } },
            workflowOverlayFile("alpha", 5, true, 1),
          ],
        },
      ]),
    ).toThrow("base workflow after enabled overlays");
  });

  test("rejects duplicate enabled native overlay IDs within and across source groups", () => {
    const duplicate = (path: string, order: number): SpecKitFile => ({
      ...workflowOverlayFile("duplicate", 5, true, order),
      path,
    });
    const base: SpecKitFile = {
      path: ".specify/workflows/speckit/workflow.yml",
      content: fixture("workflow-core-c0fe0e4.yml"),
      kind: "workflow",
      provenance: provenance("core", "speckit", 2, {
        resolutionScope: "workflow:speckit",
      }),
    };

    expect(() =>
      importedFiles([
        duplicate(".specify/workflows/overlays/speckit/duplicate-a.yml", 0),
        duplicate(".specify/workflows/overlays/speckit/duplicate-b.yml", 1),
        base,
      ]),
    ).toThrow("Duplicate overlay id 'duplicate'");

    expect(() =>
      importedSources([
        {
          sourceId: "spec-kit.duplicate-a",
          revision: "git:a",
          role: "overlay",
          authority: "advisory",
          files: [duplicate(".specify/workflows/overlays/speckit/duplicate-a.yml", 0)],
        },
        {
          sourceId: "spec-kit.duplicate-b",
          revision: "git:b",
          role: "overlay",
          authority: "advisory",
          files: [duplicate(".specify/workflows/overlays/speckit/duplicate-b.yml", 1)],
        },
        {
          sourceId: "spec-kit.base",
          revision: "git:base",
          role: "primary",
          authority: "authoritative",
          files: [base],
        },
      ]),
    ).toThrow("Duplicate overlay id 'duplicate'");
  });
});
