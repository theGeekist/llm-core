import { describe, expect, test } from "bun:test";
import type { SpecKitFile } from "../../../src/adapters/spec-kit/public";
import { loadSpecification } from "../../../src/specifications";
import {
  fixture,
  importedFiles,
  importedSources,
  nestedWorkflowBaseFile,
  nestedWorkflowOverlayFile,
  provenance,
  workflowOverlayFile,
} from "./spec-kit-test-fixtures";

describe("Spec Kit adapter", () => {
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
    expect(importedFiles([enabled, disabled, base]).operation.disposition).toBe("supported");

    const distinct = importedFiles([
      workflowOverlayFile("alpha", 5, true, 0),
      workflowOverlayFile("zulu", 5, true, 1),
      { ...base, provenance: { ...base.provenance, order: 2 } },
    ]);
    expect(distinct.operation.disposition).toBe("supported");
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
      expect(() =>
        importedFiles([
          nestedWorkflowOverlayFile(`destructive-${index}`, 5, true, 0, edits),
          nestedWorkflowBaseFile(1),
        ]),
      ).toThrow("'choose' is an ancestor of 'retry'");
    });
  });

  test("reports nested winning-anchor conflicts in pinned lexical order", () => {
    expect(() =>
      importedFiles([
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
      ]),
    ).toThrow("'choose' is an ancestor of 'check'");
  });

  test("resolves conflict winners across priorities and ASCII overlay-ID ties", () => {
    expect(() =>
      importedFiles([
        nestedWorkflowOverlayFile("parent", 5, true, 0, `  - remove: choose\n`),
        nestedWorkflowOverlayFile("child", 20, true, 1, `  - remove: retry\n`),
        nestedWorkflowBaseFile(2),
      ]),
    ).toThrow("portable derivation is unsupported");

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
    expect(splitPrioritySafe.operation.disposition).toBe("supported");

    expect(() =>
      importedFiles([
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
      ]),
    ).toThrow("portable derivation is unsupported");

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
    expect(tiedSafe.operation.disposition).toBe("supported");
    expect(
      tiedSafe.operation.diagnostics.some(
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
    expect(disabled.operation.disposition).toBe("supported");

    expect(() =>
      importedFiles([nestedWorkflowOverlayFile("unverified", 5, true, 0, `  - remove: choose\n`)]),
    ).toThrow("base workflow tree");
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
    expect(imported.operation.disposition).toBe("supported");
    expect(
      imported.operation.diagnostics.every((diagnostic) => diagnostic.impact === "advisory"),
    ).toBe(true);
  });
});
