import { describe, expect, test } from "bun:test";
import { contractVersion, digest, extensionNamespace } from "#contracts";
import {
  createConversionReport,
  createProposedSpecificationChange,
  createSpecificationAdapterSupport,
  createSpecificationDecision,
  createSpecificationDecisionRecord,
  createSpecificationSourceSnapshot,
  type ProposedSpecificationChange,
  type SpecificationDecisionRecord,
  type SpecificationSourceSnapshot,
} from "../../src/features/specifications/public";
import { createSpecificationGraph } from "../../src/features/specifications/factory";
import type {
  SpecificationGraph,
  SpecificationNodeId,
  SpecificationSourceId,
} from "../../src/features/specifications/types";

const sourceId = "source.product" as SpecificationSourceId;
const firstNodeId = "requirement.one" as SpecificationNodeId;
const secondNodeId = "decision.two" as SpecificationNodeId;
const format = {
  id: extensionNamespace("org.example.openspec"),
  version: contractVersion("1.0.0"),
};
const sourceDigest = digest("1".repeat(64));
const resolvedDigest = digest("2".repeat(64));
const evidenceDigest = digest("3".repeat(64));

const sourceInput = () => ({
  sourceId,
  format,
  revision: "revision.1",
  contentDigest: sourceDigest,
  observedAt: "2026-08-01T00:00:00.000Z",
  role: "primary" as const,
  authority: "authoritative" as const,
  documents: [
    {
      documentId: "root.document",
      content: { title: "Launch", requirements: ["one", "two"] },
    },
  ],
  extensions: { "org.example.source": { imported: true } },
});

const snapshot = (): SpecificationSourceSnapshot =>
  sourceInput() as unknown as SpecificationSourceSnapshot;

const graphInput = (): SpecificationGraph =>
  ({
    graphId: "graph.product",
    version: contractVersion("1.0.0"),
    sources: [snapshot()],
    nodes: [
      {
        nodeId: firstNodeId,
        kind: "requirement",
        title: "Serve the user",
        source: { sourceId, documentId: "root.document", location: "/requirements/0" },
      },
      {
        nodeId: secondNodeId,
        kind: "decision",
        title: "Require approval",
        source: { sourceId, documentId: "root.document", location: "/decisions/0" },
      },
    ],
    relationships: [
      {
        relationshipId: "relationship.one",
        kind: "relates",
        from: firstNodeId,
        to: secondNodeId,
        source: { sourceId, documentId: "root.document" },
      },
      {
        relationshipId: "relationship.two",
        kind: "refines",
        from: secondNodeId,
        to: firstNodeId,
        source: { sourceId, documentId: "root.document" },
      },
    ],
  }) as unknown as SpecificationGraph;

const decisionRecord = (): SpecificationDecisionRecord =>
  ({
    recordId: "decision-record.1",
    resolvedDigest,
    acceptedScope: [firstNodeId],
    decision: { kind: "combined", summary: "The scoped requirement is approved." },
    evidence: [{ evidenceId: "evidence.review", digest: evidenceDigest }],
    authority: "authority.product",
    policyVersions: [{ policyId: "policy.approval", version: contractVersion("1.0.0") }],
    sources: [{ sourceId, revision: "revision.1", contentDigest: sourceDigest }],
    validity: {
      expiresAt: "2026-08-02T00:00:00.000Z",
      invalidatedBy: ["source-revision", "policy-version"],
    },
  }) as unknown as SpecificationDecisionRecord;

const proposal = (): ProposedSpecificationChange =>
  ({
    changeId: "proposal.1",
    target: { sourceId, format, baseRevision: "revision.1", baseDigest: sourceDigest },
    changes: { operation: "replace", path: "/requirements/0", value: "Serve every user" },
    originatingDecision: { recordId: "decision-record.1", resolvedDigest },
    evidence: [{ evidenceId: "evidence.review", digest: evidenceDigest }],
    conversion: {
      fidelity: "exact",
      issues: [],
    },
  }) as unknown as ProposedSpecificationChange;

describe("specification contracts", () => {
  test("detaches and freezes source snapshots while preserving strict native extensions", () => {
    const input = sourceInput();
    const captured = createSpecificationSourceSnapshot(
      input as unknown as SpecificationSourceSnapshot,
    );
    input.documents[0]!.content = { title: "Changed", requirements: [] };
    input.extensions["org.example.source"] = { imported: false };

    expect(captured.documents[0]?.content).toEqual({
      title: "Launch",
      requirements: ["one", "two"],
    });
    expect(captured.extensions).toEqual({ "org.example.source": { imported: true } });
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.documents)).toBe(true);
    expect(Object.isFrozen(captured.extensions)).toBe(true);
  });

  test("permits semantic cycles while requiring unique traced identities and declared endpoints", () => {
    const graph = createSpecificationGraph(graphInput());
    expect(graph.relationships).toHaveLength(2);
    expect(graph.relationships.map((relationship) => relationship.from)).toEqual([
      firstNodeId,
      secondNodeId,
    ]);
    expect(Object.isFrozen(graph.relationships[0]?.source)).toBe(true);

    const duplicate = structuredClone(graphInput()) as unknown as {
      nodes: Array<{ nodeId: SpecificationNodeId }>;
    };
    duplicate.nodes.push(structuredClone(duplicate.nodes[0]!));
    expect(() => createSpecificationGraph(duplicate as never)).toThrow("unique graph node");

    const dangling = structuredClone(graphInput()) as unknown as {
      relationships: Array<{ to: SpecificationNodeId }>;
    };
    dangling.relationships[0]!.to = "missing.node" as SpecificationNodeId;
    expect(() => createSpecificationGraph(dangling as never)).toThrow("declared nodes");

    const untraced = structuredClone(graphInput()) as unknown as {
      nodes: Array<{ source: { documentId: string } }>;
    };
    untraced.nodes[0]!.source.documentId = "missing.document";
    expect(() => createSpecificationGraph(untraced as never)).toThrow("declared source documents");

    const reportWithUnknownSource = structuredClone(graphInput()) as unknown as {
      report: unknown;
    };
    reportWithUnknownSource.report = {
      fidelity: "partial",
      issues: [
        {
          code: "missing-source",
          severity: "warning",
          disposition: "degraded",
          explanation: "The source could not be resolved.",
          source: { sourceId: "missing.source", documentId: "missing.document" },
        },
      ],
    };
    expect(() => createSpecificationGraph(reportWithUnknownSource as never)).toThrow(
      "conversion report issue bindings to declared source documents",
    );

    const reportWithUnknownNode = structuredClone(graphInput()) as unknown as {
      report: unknown;
    };
    reportWithUnknownNode.report = {
      fidelity: "rejected",
      issues: [
        {
          code: "missing-node",
          severity: "error",
          disposition: "rejected",
          explanation: "The canonical node could not be resolved.",
          nodeId: "missing.node",
        },
      ],
    };
    expect(() => createSpecificationGraph(reportWithUnknownNode as never)).toThrow(
      "conversion report issue node identities that reference declared graph nodes",
    );
  });

  test("declares versioned adapter support and records conversion loss explicitly", () => {
    const support = createSpecificationAdapterSupport({
      format,
      direction: "both",
      supportedVersions: [contractVersion("1.0.0")],
      levels: ["syntax", "semantic"],
      features: ["requirements", "decisions"],
      preservedExtensionNamespaces: [extensionNamespace("org.example.source")],
      sourceOwnership: "source-owned",
      writeBack: "proposal-only",
      fixtures: [{ fixtureId: "fixture.openspec.v1", digest: evidenceDigest }],
      evidence: [{ evidenceId: "evidence.openspec.v1", digest: evidenceDigest }],
    });
    expect(Object.isFrozen(support)).toBe(true);
    expect(support.writeBack).toBe("proposal-only");

    expect(() =>
      createSpecificationAdapterSupport({
        ...support,
        writeBack: "implicit" as never,
      }),
    ).toThrow("known adapter write-back behaviors");
    expect(() =>
      createSpecificationAdapterSupport({
        ...support,
        writeBack: "source-authorized",
      }),
    ).toThrow("source-authorized write-back to declare lifecycle conformance");
    expect(() =>
      createSpecificationAdapterSupport({
        ...support,
        fixtures: [],
      }),
    ).toThrow("at least one adapter support fixture");

    const partial = createConversionReport({
      fidelity: "partial",
      issues: [
        {
          code: "workflow-loop",
          severity: "warning",
          disposition: "degraded",
          explanation: "The target cannot express the bounded loop.",
          source: { sourceId, documentId: "root.document", location: "/workflow" },
        },
      ],
    });
    expect(partial.issues[0]?.disposition).toBe("degraded");
    expect(() =>
      createConversionReport({
        fidelity: "exact",
        issues: [
          {
            code: "loss",
            severity: "error",
            disposition: "rejected",
            explanation: "Loss is not exact.",
            nodeId: firstNodeId,
          },
        ],
      }),
    ).toThrow("exact conversion");
  });

  test("keeps decision records and change proposals portable, immutable, and non-operative", () => {
    const record = createSpecificationDecisionRecord(decisionRecord());
    const accepted = createSpecificationDecision({ status: "accepted", record });
    const change = createProposedSpecificationChange(proposal());

    expect(accepted).toEqual({ status: "accepted", record });
    expect(record.validity.invalidatedBy).toEqual(["source-revision", "policy-version"]);
    expect(Object.isFrozen(change)).toBe(true);
    expect(Object.hasOwn(change, "apply")).toBe(false);
    expect(change.target.baseDigest).toEqual(sourceDigest);

    expect(() =>
      createSpecificationDecision({
        status: "needs-input",
        questions: [],
      } as never),
    ).toThrow("non-empty unresolved questions");
  });

  test("fails closed for hostile or non-portable input without invoking accessors", () => {
    let reads = 0;
    const accessor = sourceInput() as Record<string, unknown>;
    Object.defineProperty(accessor, "authority", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "authoritative";
      },
    });
    expect(() => createSpecificationSourceSnapshot(accessor as never)).toThrow("strict JSON");
    expect(reads).toBe(0);

    const symbol = sourceInput() as Record<PropertyKey, unknown>;
    symbol[Symbol("native")] = true;
    expect(() => createSpecificationSourceSnapshot(symbol as never)).toThrow("strict JSON");

    const cyclic = sourceInput();
    const value: Record<string, unknown> = {};
    value.self = value;
    cyclic.documents[0]!.content = value as never;
    expect(() => createSpecificationSourceSnapshot(cyclic as never)).toThrow("strict JSON");

    const sparse = sourceInput();
    sparse.documents = new Array(1) as never;
    expect(() => createSpecificationSourceSnapshot(sparse as never)).toThrow("strict JSON");

    expect(() => createSpecificationSourceSnapshot(new Proxy(sourceInput(), {}) as never)).toThrow(
      "strict JSON",
    );
  });
});
