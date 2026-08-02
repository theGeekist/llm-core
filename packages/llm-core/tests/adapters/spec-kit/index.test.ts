/* eslint-disable max-lines, max-params -- pinned integration evidence stays readable together */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  SPEC_KIT_CLI_SUPPORT,
  SPEC_KIT_FILE_SUPPORT,
  importSpecKitFiles,
  observeSpecKitCliVersion,
  observeSpecKitWorkflowStatus,
  parseSpecKitWorkflow,
  parseSpecKitWorkflowOverlay,
  type SpecKitFile,
  type SpecKitFileSource,
} from "../../../src/adapters/spec-kit";
import { parseSpecKitWorkflowYaml } from "../../../src/adapters/spec-kit/yaml";
import { loadSpecification } from "../../../src/specifications";

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const observedAt = "2026-08-02T06:07:24.000Z";
const exactSpecKitPython = process.env.LLM_CORE_SPEC_KIT_PYTHON;

const provenance = (
  tier: SpecKitFile["provenance"]["tier"],
  providerId: string,
  order: number,
  extra: Partial<SpecKitFile["provenance"]> = {},
): SpecKitFile["provenance"] => ({
  tier,
  providerId,
  resolutionScope: "artifact:default",
  order,
  ...extra,
});

const importedFiles = (files: readonly SpecKitFile[]) =>
  importSpecKitFiles({
    observedAt,
    sources: [
      {
        sourceId: "spec-kit.payment-service",
        revision: "git:c0fe0e4",
        role: "primary",
        authority: "authoritative",
        files,
      },
    ],
  });

const importedSources = (sources: readonly SpecKitFileSource[]) =>
  importSpecKitFiles({ observedAt, sources });

const workflowOverlayFile = (
  overlayId: string,
  priority: number,
  enabled: boolean,
  order: number,
): SpecKitFile => ({
  path: `.specify/workflows/overlays/speckit/${overlayId}.yml`,
  content: `id: ${overlayId}\nextends: speckit\npriority: ${priority}\nenabled: ${String(enabled)}\nedits:\n  - remove: review-plan\n`,
  kind: "overlay",
  provenance: provenance("workflow-overlay", `project:${overlayId}`, order, {
    resolutionScope: "workflow:speckit",
    priority,
  }),
});

const nestedWorkflowOverlayFile = (
  overlayId: string,
  priority: number,
  enabled: boolean,
  order: number,
  edits: string,
): SpecKitFile => ({
  path: `.specify/workflows/overlays/control-flow-proof/${overlayId}.yml`,
  content: `id: ${overlayId}\nextends: control-flow-proof\npriority: ${priority}\nenabled: ${String(enabled)}\nedits:\n${edits}`,
  kind: "overlay",
  provenance: provenance("workflow-overlay", `project:${overlayId}`, order, {
    resolutionScope: "workflow:control-flow-proof",
    priority,
  }),
});

const nestedWorkflowBaseFile = (order: number): SpecKitFile => ({
  path: ".specify/workflows/control-flow-proof/workflow.yml",
  content: fixture("workflow-control-flow-c0fe0e4.yml"),
  kind: "workflow",
  provenance: provenance("core", "control-flow-proof", order, {
    resolutionScope: "workflow:control-flow-proof",
  }),
});

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

  test("excludes disabled duplicates and preserves distinct equal-priority ASCII order", () => {
    const enabled = workflowOverlayFile("duplicate", 5, true, 0);
    const disabled: SpecKitFile = {
      ...workflowOverlayFile("duplicate", 5, false, 99),
      path: ".specify/workflows/overlays/speckit/duplicate-disabled.yml",
    };
    const base: SpecKitFile = {
      path: ".specify/workflows/speckit/workflow.yml",
      content: fixture("workflow-core-c0fe0e4.yml"),
      kind: "workflow",
      provenance: provenance("core", "speckit", 1, {
        resolutionScope: "workflow:speckit",
      }),
    };
    expect(importedFiles([enabled, disabled, base]).report.fidelity).toBe("exact");

    const distinct = importedFiles([
      workflowOverlayFile("alpha", 5, true, 0),
      workflowOverlayFile("zulu", 5, true, 1),
      { ...base, provenance: { ...base.provenance, order: 2 } },
    ]);
    expect(distinct.report.fidelity).toBe("exact");
  });

  test("rejects winning ancestor replace and remove operations with descendant edits", () => {
    const destructiveEdits = [
      `  - replace: choose
    step: { id: choose, type: shell, run: replacement }
  - remove: retry
`,
      `  - remove: choose
  - remove: retry
`,
    ];
    destructiveEdits.forEach((edits, index) => {
      const imported = importedFiles([
        nestedWorkflowOverlayFile(`destructive-${index}`, 5, true, 0, edits),
        nestedWorkflowBaseFile(1),
      ]);
      expect(imported.report).toMatchObject({
        fidelity: "rejected",
        issues: [
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            code: "spec-kit-workflow-overlay-anchor-conflict",
            disposition: "rejected",
            explanation: expect.stringContaining("'choose' is an ancestor of 'retry'"),
          }),
        ],
      });
    });
  });

  test("reports nested winning-anchor conflicts in pinned lexical order", () => {
    const imported = importedFiles([
      nestedWorkflowOverlayFile(
        "nested-chain",
        5,
        true,
        0,
        `  - remove: retry
  - remove: choose
  - remove: check
`,
      ),
      nestedWorkflowBaseFile(1),
    ]);
    expect(
      imported.report.issues
        .filter((issue) => issue.code === "spec-kit-workflow-overlay-anchor-conflict")
        .map((issue) => issue.explanation),
    ).toEqual([
      expect.stringContaining("'choose' is an ancestor of 'check'"),
      expect.stringContaining("'choose' is an ancestor of 'retry'"),
      expect.stringContaining("'retry' is an ancestor of 'check'"),
    ]);
  });

  test("resolves conflict winners across priorities and ASCII overlay-ID ties", () => {
    const splitPriority = importedFiles([
      nestedWorkflowOverlayFile("parent", 5, true, 0, `  - remove: choose\n`),
      nestedWorkflowOverlayFile("child", 20, true, 1, `  - remove: retry\n`),
      nestedWorkflowBaseFile(2),
    ]);
    expect(splitPriority.report).toMatchObject({
      fidelity: "rejected",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "spec-kit-workflow-overlay-anchor-conflict" }),
      ]),
    });

    const splitPrioritySafe = importedFiles([
      nestedWorkflowOverlayFile(
        "lower-priority-winner",
        5,
        true,
        0,
        `  - insert_after: choose
    step: { id: after-choose, type: shell, run: echo }
  - remove: retry
`,
      ),
      nestedWorkflowOverlayFile("higher-priority-loser", 20, true, 1, `  - remove: choose\n`),
      nestedWorkflowBaseFile(2),
    ]);
    expect(splitPrioritySafe.report.fidelity).toBe("exact");

    const tiedConflict = importedFiles([
      nestedWorkflowOverlayFile(
        "alpha",
        5,
        true,
        0,
        `  - insert_after: choose
    step: { id: after-choose, type: shell, run: echo }
  - remove: retry
`,
      ),
      nestedWorkflowOverlayFile("zulu", 5, true, 1, `  - remove: choose\n`),
      nestedWorkflowBaseFile(2),
    ]);
    expect(tiedConflict.report.fidelity).toBe("rejected");

    const tiedSafe = importedFiles([
      nestedWorkflowOverlayFile(
        "alpha",
        5,
        true,
        0,
        `  - remove: choose
  - remove: retry
`,
      ),
      nestedWorkflowOverlayFile(
        "zulu",
        5,
        true,
        1,
        `  - insert_after: choose
    step: { id: after-choose, type: shell, run: echo }
`,
      ),
      nestedWorkflowBaseFile(2),
    ]);
    expect(tiedSafe.report.fidelity).toBe("exact");
    expect(
      tiedSafe.report.issues.some(
        (issue) => issue.code === "spec-kit-workflow-overlay-anchor-conflict",
      ),
    ).toBe(false);
  });

  test("ignores disabled conflicts and degrades enabled overlays without a base", () => {
    const disabled = importedFiles([
      nestedWorkflowOverlayFile("disabled-parent", 1, false, 99, `  - remove: choose\n`),
      nestedWorkflowOverlayFile("child", 5, true, 0, `  - remove: retry\n`),
      nestedWorkflowBaseFile(1),
    ]);
    expect(disabled.report.fidelity).toBe("exact");

    const missingBase = importedFiles([
      nestedWorkflowOverlayFile("unverified", 5, true, 0, `  - remove: choose\n`),
    ]);
    expect(missingBase.report).toMatchObject({
      fidelity: "partial",
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "spec-kit-workflow-overlay-base-unobserved",
          disposition: "degraded",
        }),
      ]),
    });
  });

  test("emits heterogeneous source snapshots and bindings while retaining native scope order", () => {
    const files: SpecKitFile[] = [
      {
        path: "z-project.md",
        content: "# Project override",
        kind: "constitution",
        provenance: provenance("project", "project-override", 0, {
          resolutionScope: "template:constitution",
          strategy: "replace",
        }),
      },
      {
        path: "a-preset.md",
        content: "# Preset",
        kind: "overlay",
        provenance: provenance("preset", "regulated", 1, {
          resolutionScope: "template:constitution",
          priority: 2,
          strategy: "prepend",
        }),
      },
      {
        path: "m-extension.md",
        content: "# Extension",
        kind: "overlay",
        provenance: provenance("extension", "security", 2, {
          resolutionScope: "template:constitution",
          priority: 5,
        }),
      },
      {
        path: "b-core.md",
        content: "# Core",
        kind: "constitution",
        provenance: provenance("core", "speckit", 3, {
          resolutionScope: "template:constitution",
        }),
      },
      {
        path: "x-workflow-overlay.yml",
        content: fixture("workflow-overlay-installed-c0fe0e4.yml"),
        kind: "overlay",
        provenance: provenance("workflow-overlay", "project:review-hardening", 0, {
          resolutionScope: "workflow:speckit",
          priority: 5,
        }),
      },
      {
        path: ".specify/workflows/speckit/workflow.yml",
        content: fixture("workflow-core-c0fe0e4.yml"),
        kind: "workflow",
        provenance: provenance("core", "speckit", 1, {
          resolutionScope: "workflow:speckit",
        }),
      },
    ];
    const imported = importedSources([
      {
        sourceId: "spec-kit.project",
        revision: "git:project",
        role: "primary",
        authority: "authoritative",
        files: [files[0]!, files[3]!, files[5]!],
      },
      {
        sourceId: "spec-kit.layers",
        revision: "registry:c0fe0e4",
        role: "overlay",
        authority: "advisory",
        files: [files[1]!, files[2]!, files[4]!],
      },
    ]);
    const specification = loadSpecification(imported.graph);
    const [primary, overlays] = specification.sources;

    expect(primary).toMatchObject({ role: "primary", authority: "authoritative" });
    expect(overlays).toMatchObject({ role: "overlay", authority: "advisory" });
    const graph = imported.graph as {
      nodes: Array<{
        source: { sourceId: string };
        extensions: Record<string, unknown>;
      }>;
    };
    expect(graph.nodes.map((node) => node.source.sourceId)).toEqual([
      "spec-kit.project",
      "spec-kit.project",
      "spec-kit.project",
      "spec-kit.layers",
      "spec-kit.layers",
      "spec-kit.layers",
    ]);
    const resolutionEntries = specification.sources.flatMap(
      (source) =>
        (
          source.extensions?.["io.github.spec-kit"] as {
            resolutionOrder: Array<{
              resolutionScope: string;
              order: number;
              providerId: string;
            }>;
          }
        ).resolutionOrder,
    );
    const constitutionPrecedence = resolutionEntries
      .filter((entry) => entry.resolutionScope === "template:constitution")
      .sort((left, right) => left.order - right.order);
    expect(constitutionPrecedence.map((entry) => entry.order)).toEqual([0, 1, 2, 3]);
    expect(constitutionPrecedence.map((entry) => entry.providerId)).toEqual([
      "project-override",
      "regulated",
      "security",
      "speckit",
    ]);
    expect(resolutionEntries).toEqual(
      expect.arrayContaining(files.map((file) => ({ path: file.path, ...file.provenance }))),
    );
    expect(graph.nodes.at(-1)?.extensions["io.github.spec-kit"]).toMatchObject({
      overlayProgram: {
        overlayId: "review-hardening",
        extendsWorkflowId: "speckit",
        priority: 5,
        enabled: true,
      },
    });
    expect(imported.report.fidelity).toBe("exact");
    expect(imported.report.issues.every((issue) => issue.disposition === "preserved")).toBe(true);
  });

  test("derives exact, partial, and rejected fidelity from issue dispositions", () => {
    const exact = importedFiles([
      {
        path: "workflows/speckit/workflow.yml",
        content: fixture("workflow-core-c0fe0e4.yml"),
        kind: "workflow",
        provenance: provenance("core", "speckit", 0),
      },
    ]);
    expect(exact.report).toMatchObject({
      fidelity: "exact",
      issues: [expect.objectContaining({ disposition: "preserved" })],
    });

    const partial = importedFiles([
      {
        path: ".specify/workflows/runs/run-1/state.json",
        content: '{"status":"paused"}',
        kind: "workflow-state",
        provenance: provenance("workflow-run", "run-1", 0),
      },
    ]);
    expect(partial.report).toMatchObject({
      fidelity: "partial",
      issues: [expect.objectContaining({ disposition: "degraded" })],
    });

    const rejected = importedFiles([
      {
        path: "workflows/invalid.yml",
        content: 'schema_version: "2.0"\nworkflow: nope\nsteps: []\n',
        kind: "workflow",
        provenance: provenance("core", "speckit", 0),
      },
    ]);
    expect(rejected.report).toMatchObject({
      fidelity: "rejected",
      issues: expect.arrayContaining([expect.objectContaining({ disposition: "rejected" })]),
    });
  });

  test("degrades custom extension steps while retaining their complete native definition", () => {
    const parsed = parseSpecKitWorkflow(`
schema_version: "1.0"
workflow:
  id: "custom"
  name: "Custom"
  version: "1.0.0"
steps:
  - id: deploy
    type: acme-deploy
    environment: production
`);
    expect(parsed.issues).toEqual([
      expect.objectContaining({
        code: "spec-kit-workflow-custom-step-uninterpreted",
        disposition: "degraded",
      }),
      expect.objectContaining({ disposition: "preserved" }),
    ]);
    expect(parsed.program?.steps[0]?.definition).toEqual({
      id: "deploy",
      type: "acme-deploy",
      environment: "production",
    });
  });

  test("rejects workflow shapes rejected by the pinned c0fe0e43 validators", () => {
    const invalidFragments = [
      `requires:\n  permissions: [shell]\nsteps:\n  - id: run\n    type: shell\n    run: echo ok`,
      `inputs:\n  count:\n    type: number\n    default: nope\nsteps:\n  - id: run\n    type: shell\n    run: echo ok`,
      `steps:\n  - id: review\n    type: gate\n    options: [approve, reject]`,
      `steps:\n  - id: review\n    type: gate\n    message: Review\n    options: [approve]\n    on_reject: retry`,
      `steps:\n  - id: dispatch\n    command: speckit.plan\n    input: [not, a, mapping]`,
      `steps:\n  - id: run\n    type: shell\n    run: echo ok\n    timeout: true`,
    ];

    invalidFragments.forEach((fragment) => {
      const parsed = parseSpecKitWorkflow(`
schema_version: "1.0"
workflow:
  id: "invalid-proof"
  name: "Invalid Proof"
  version: "1.0.0"
${fragment}
`);
      expect(parsed.program).toBeUndefined();
      expect(parsed.issues.some((issue) => issue.disposition === "rejected")).toBe(true);
    });
  });

  test("matches qualified PyYAML scalar values and rejects silent scalar divergence", () => {
    const yes = parseSpecKitWorkflow(`
schema_version: "1.0"
workflow: { id: yaml-yes, name: YAML Yes, version: "1.0.0" }
inputs:
  approved: { type: boolean, default: yes }
steps:
  - { id: run, type: shell, run: echo }
`);
    const no = parseSpecKitWorkflow(`
schema_version: "1.0"
workflow: { id: yaml-no, name: YAML No, version: "1.0.0" }
inputs:
  approved: { type: boolean, default: NO }
steps:
  - { id: run, type: shell, run: echo }
`);
    expect(
      (yes.program?.definition.inputs as { approved: { default: unknown } }).approved.default,
    ).toBe(true);
    expect(
      (no.program?.definition.inputs as { approved: { default: unknown } }).approved.default,
    ).toBe(false);
    expect(parseSpecKitWorkflowYaml("value: .5")).toEqual({ value: 0.5 });
    expect(parseSpecKitWorkflowYaml("value: -.5")).toEqual({ value: "-.5" });
    expect(parseSpecKitWorkflowYaml("value: 08")).toEqual({ value: "08" });
    ["value: 9007199254740993", "value: 2026-08-02", "value: 12:34", "value: .inf"].forEach(
      (content) => expect(() => parseSpecKitWorkflowYaml(content)).toThrow(),
    );

    const numericSchema = parseSpecKitWorkflow(`
schema_version: 1.0
workflow: { id: numeric-schema, name: Numeric Schema, version: "1.0.0" }
steps:
  - { id: run, type: shell, run: echo }
`);
    expect(numericSchema.program).toBeUndefined();
    expect(numericSchema.issues).toContainEqual(
      expect.objectContaining({ disposition: "rejected", location: "/schema_version" }),
    );
  });

  test.skipIf(!exactSpecKitPython)(
    "differentially matches or rejects exact pinned PyYAML safe_load scalar resolution",
    () => {
      const cases = [
        ...[
          "null",
          "~",
          "yes",
          "ON",
          "false",
          "off",
          "0",
          "-0",
          "+12",
          "1_2",
          "012",
          "0b10",
          "0x10",
          "0.5",
          ".5",
          "1.",
          "1_000.5",
          ".5e+2",
          "1.0e+1_0",
          ".5e+1_0",
          "-.5",
          "+.5",
          "08",
          "0o12",
          "1e+2",
          "plain",
          "'yes'",
          '"yes"',
        ].map((scalar) => ({ scalar, disposition: "match" as const })),
        ...[
          "9007199254740993",
          "0x20000000000001",
          "12:34",
          "1:20.5",
          "2026-08-02",
          "2026-08-02T12:34:56Z",
          ".inf",
          "-.Inf",
          ".nan",
        ].map((scalar) => ({ scalar, disposition: "reject" as const })),
      ];
      const python = String.raw`
import datetime, json, math, sys, yaml

def encode(value):
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return {"kind": "value", "value": value}
    if isinstance(value, int):
        return {"kind": "integer", "decimal": str(value)}
    if isinstance(value, float) and math.isfinite(value):
        return {"kind": "float", "value": value}
    if isinstance(value, float):
        return {"kind": "non-finite"}
    if isinstance(value, (datetime.date, datetime.datetime)):
        return {"kind": "timestamp"}
    return {"kind": type(value).__name__}

scalars = json.loads(sys.argv[1])
print(json.dumps({
    "version": yaml.__version__,
    "values": [encode(yaml.safe_load("value: " + scalar)["value"]) for scalar in scalars],
}))
`;
      const differential = Bun.spawnSync([
        exactSpecKitPython!,
        "-c",
        python,
        JSON.stringify(cases.map(({ scalar }) => scalar)),
      ]);
      expect(differential.stderr.toString()).toBe("");
      expect(differential.exitCode).toBe(0);
      const native = JSON.parse(differential.stdout.toString()) as {
        version: string;
        values: Array<
          | { kind: "value"; value: string | number | boolean | null }
          | { kind: "integer"; decimal: string }
          | { kind: "float"; value: number }
          | { kind: "non-finite" | "timestamp" }
        >;
      };
      expect(native.version).toBe("6.0.3");
      cases.forEach(({ scalar, disposition }, index) => {
        const expected = native.values[index]!;
        if (disposition === "reject") {
          expect(() => parseSpecKitWorkflowYaml(`value: ${scalar}`)).toThrow();
          return;
        }
        const actual = parseSpecKitWorkflowYaml(`value: ${scalar}`).value;
        if (expected.kind === "integer") {
          expect(actual).toBe(Number(expected.decimal));
        } else {
          expect(expected.kind === "value" || expected.kind === "float").toBe(true);
          expect(actual).toBe("value" in expected ? expected.value : undefined);
        }
      });
    },
  );

  test("observes run, resume, and status commands without conflating exit and stored outcome", () => {
    const version = observeSpecKitCliVersion({ observedAt, stdout: "specify 0.14.3.dev0\n" });
    expect(version.version).toBe("0.14.3.dev0");

    const failedRun = observeSpecKitWorkflowStatus({
      observedAt,
      version: version.version,
      command: "run",
      exitCode: 1,
      stdout: fixture("run-failed-c0fe0e4.json"),
    });
    expect(failedRun).toMatchObject({
      kind: "run-outcome",
      command: "run",
      status: "failed",
      commandExitCode: 1,
      runOutcome: "failed",
    });

    const pausedResume = observeSpecKitWorkflowStatus({
      observedAt,
      version: version.version,
      command: "resume",
      exitCode: 0,
      stdout: fixture("resume-paused-c0fe0e4.json"),
    });
    expect(pausedResume).toMatchObject({
      kind: "run-outcome",
      command: "resume",
      status: "paused",
      commandExitCode: 0,
      runOutcome: "non-terminal",
      gate: { stepId: "review", choice: null },
    });

    const run = observeSpecKitWorkflowStatus({
      observedAt,
      version: version.version,
      command: "status",
      exitCode: 0,
      stdout: fixture("status-run-aborted-c0fe0e4.json"),
    });
    expect(run).toMatchObject({
      kind: "run-status",
      command: "status",
      status: "aborted",
      gate: { stepId: "review", choice: "reject" },
      steps: { choose: "completed", review: "failed" },
      commandExitCode: 0,
      runOutcome: "failed",
    });

    const list = observeSpecKitWorkflowStatus({
      observedAt,
      version: version.version,
      command: "status",
      exitCode: 0,
      stdout: fixture("status-list-c0fe0e4.json"),
    });
    expect(list).toMatchObject({
      kind: "list-status",
      runs: [
        { status: "created", runOutcome: "non-terminal" },
        { status: "aborted", runOutcome: "failed" },
      ],
    });
    expect(Object.isFrozen(list)).toBe(true);
    expect(Object.isFrozen(list.raw)).toBe(true);
  });

  test("enforces the complete native command by run-status matrix", () => {
    const commands = ["run", "resume", "status"] as const;
    const statuses = ["created", "running", "paused", "completed", "failed", "aborted"] as const;
    const commandStatuses = new Set(["paused", "completed", "failed", "aborted"]);

    for (const command of commands) {
      for (const status of statuses) {
        const exitCode =
          command !== "status" && (status === "failed" || status === "aborted") ? 1 : 0;
        const stdout = JSON.stringify({
          run_id: `matrix-${command}-${status}`,
          workflow_id: "speckit",
          status,
          current_step_id: null,
          current_step_index: 0,
          ...(command === "status"
            ? { created_at: observedAt, updated_at: observedAt, steps: {} }
            : {}),
        });
        const observe = () =>
          observeSpecKitWorkflowStatus({
            observedAt,
            version: "0.14.3.dev0",
            command,
            exitCode,
            stdout,
          });
        if (command === "status" || commandStatuses.has(status)) {
          expect(observe).not.toThrow();
        } else {
          expect(observe).toThrow("run/resume");
        }
      }
    }
  });

  test("rejects status shapes the pinned CLI never emits", () => {
    const payload = JSON.parse(fixture("status-run-aborted-c0fe0e4.json")) as Record<
      string,
      unknown
    >;
    payload.status = "cancelled";
    expect(() =>
      observeSpecKitWorkflowStatus({
        observedAt,
        version: "0.14.3.dev0",
        command: "status",
        exitCode: 0,
        stdout: JSON.stringify(payload),
      }),
    ).toThrow("run shape");
    expect(() => observeSpecKitCliVersion({ observedAt, stdout: "0.14.3.dev0" })).toThrow(
      "specify <version>",
    );
    expect(() =>
      observeSpecKitWorkflowStatus({
        observedAt,
        version: "0.14.3.dev0",
        command: "run",
        exitCode: 0,
        stdout: fixture("run-failed-c0fe0e4.json"),
      }),
    ).toThrow("exit code");
  });

  test("captures the whole input before getters can run and returns deep immutable data", () => {
    let getterRuns = 0;
    const hostile = Object.defineProperty(
      {
        revision: "r1",
        observedAt,
        files: [],
      },
      "sourceId",
      {
        enumerable: true,
        get() {
          getterRuns += 1;
          return "hostile";
        },
      },
    );
    expect(() => importSpecKitFiles(hostile as never)).toThrow("without getters");
    expect(getterRuns).toBe(0);

    const files: SpecKitFile[] = [
      {
        path: "notes.md",
        content: "# Notes",
        kind: "other",
        provenance: provenance("project", "project", 0),
      },
    ];
    const imported = importedFiles(files);
    (files[0] as { content: string }).content = "changed";
    const graph = imported.graph as {
      sources: { documents: { content: { text: string } }[] }[];
    };
    expect(graph.sources[0]?.documents[0]?.content.text).toBe("# Notes");
    expect(Object.isFrozen(imported)).toBe(true);
    expect(Object.isFrozen(graph.sources[0]?.documents[0]?.content)).toBe(true);
  });

  test("binds support declarations to exact immutable fixture bytes", () => {
    expect(SPEC_KIT_FILE_SUPPORT).toMatchObject({
      levels: ["syntax", "semantic"],
      writeBack: "unsupported",
    });
    expect(SPEC_KIT_CLI_SUPPORT).toMatchObject({
      levels: ["syntax", "semantic"],
      writeBack: "unsupported",
    });
    expect(SPEC_KIT_FILE_SUPPORT.fixtures.map((item) => item.digest.value)).toEqual([
      hash(fixture("workflow-core-c0fe0e4.yml")),
      hash(fixture("workflow-control-flow-c0fe0e4.yml")),
      hash(fixture("workflow-overlay-installed-c0fe0e4.yml")),
    ]);
    expect(SPEC_KIT_CLI_SUPPORT.fixtures.map((item) => item.digest.value)).toEqual([
      hash(fixture("run-failed-c0fe0e4.json")),
      hash(fixture("resume-paused-c0fe0e4.json")),
      hash(fixture("status-run-aborted-c0fe0e4.json")),
      hash(fixture("status-list-c0fe0e4.json")),
    ]);
  });
});
