import { describe, expect, test } from "bun:test";
import { contractVersion, digest, extensionNamespace } from "#contracts";
import {
  createProposedSpecificationChange,
  createSpecificationAdapterSupport,
  createSpecificationDecision,
  createSpecificationDecisionRecord,
  createSpecificationOperation,
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
    operation: {
      operation: "export-native-source",
      sourceContract: { authority: "Example specification", format, revision: "revision.1" },
      disposition: "supported",
      fixtures: [{ fixtureId: "fixture.export.v1", digest: evidenceDigest }],
      diagnostics: [],
    },
  }) as unknown as ProposedSpecificationChange;

describe("specification contracts", () => {
  test("validates the complete typed semantic waist and its node references", () => {
    const binding = { sourceId, documentId: "root.document" };
    const nodes = [
      {
        nodeId: "capability.answer",
        kind: "capability",
        title: "Answer questions",
        source: binding,
        content: { capabilityId: "answer", mode: "required" },
      },
      {
        nodeId: "context.session",
        kind: "context",
        title: "Session context",
        source: binding,
        content: { lifetime: "session", schema: { type: "object" } },
      },
      {
        nodeId: "tool.lookup",
        kind: "tool",
        title: "Lookup",
        source: binding,
        content: { capability: "capability.answer", effect: "read" },
      },
      {
        nodeId: "agent.support",
        kind: "agent",
        title: "Support agent",
        source: binding,
        content: {
          role: "Answer support questions",
          capabilities: ["capability.answer"],
          tools: ["tool.lookup"],
          contexts: ["context.session"],
        },
      },
      {
        nodeId: "workflow.support",
        kind: "workflow-intent",
        title: "Support workflow",
        source: binding,
        content: {
          steps: [{ stepId: "answer", invokes: "agent.support", dependsOn: [] }],
        },
      },
      {
        nodeId: "evaluation.support",
        kind: "evaluation",
        title: "Support quality",
        source: binding,
        content: {
          subject: "workflow.support",
          criteria: [{ criterionId: "correct", description: "The answer is correct." }],
        },
      },
      {
        nodeId: "approval.lookup",
        kind: "approval",
        title: "Lookup approval",
        source: binding,
        content: { subject: "tool.lookup", authority: "support.owner", timing: "before" },
      },
      {
        nodeId: "application.support",
        kind: "application",
        title: "Support application",
        source: binding,
        content: {
          capabilities: ["capability.answer"],
          entrypoints: ["workflow.support"],
        },
      },
    ];

    const graph = createSpecificationGraph({
      graphId: "graph.semantic" as never,
      version: contractVersion("1.0.0"),
      sources: [snapshot()],
      nodes: nodes as never,
      relationships: [],
    });

    expect(graph.nodes.map((node) => node.kind)).toEqual([
      "capability",
      "context",
      "tool",
      "agent",
      "workflow-intent",
      "evaluation",
      "approval",
      "application",
    ]);
    expect(() =>
      createSpecificationGraph({
        graphId: "graph.invalid-semantic" as never,
        version: contractVersion("1.0.0"),
        sources: [snapshot()],
        nodes: nodes.map((node) =>
          node.kind === "tool"
            ? { ...node, content: { capability: "context.session", effect: "read" } }
            : node,
        ) as never,
        relationships: [],
      }),
    ).toThrow("tool capability references to declared capability nodes");
  });

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

    const graphWithObsoleteReport = structuredClone(graphInput()) as unknown as {
      report: unknown;
    };
    graphWithObsoleteReport.report = { fidelity: "partial", issues: [] };
    expect(() => createSpecificationGraph(graphWithObsoleteReport as never)).toThrow(
      "closed specification graphs",
    );
  });

  test("declares exact adapter operations without treating diagnostics as support levels", () => {
    const observation = createSpecificationOperation({
      operation: "observe-native-source",
      sourceContract: { authority: "Example specification", format, revision: "revision.1" },
      disposition: "supported",
      fixtures: [{ fixtureId: "fixture.openspec.v1", digest: evidenceDigest }],
      diagnostics: [
        {
          code: "source-owned",
          severity: "info",
          impact: "advisory",
          explanation: "The detached observation does not grant write authority.",
          source: { sourceId, documentId: "root.document" },
        },
      ],
    });
    const support = createSpecificationAdapterSupport({
      format,
      authority: "Example specification",
      revision: "revision.1",
      sourceOwnership: "source-owned",
      operations: [
        observation,
        createSpecificationOperation({
          operation: "derive-portable-specification",
          sourceContract: { authority: "Example specification", format, revision: "revision.1" },
          disposition: "unsupported",
          reason: "Portable derivation is not implemented.",
          diagnostics: [],
        }),
        createSpecificationOperation({
          operation: "compile-portable-specification",
          sourceContract: { authority: "Example specification", format, revision: "revision.1" },
          disposition: "unsupported",
          reason: "Portable compilation is not implemented.",
          diagnostics: [],
        }),
        createSpecificationOperation({
          operation: "export-native-source",
          sourceContract: { authority: "Example specification", format, revision: "revision.1" },
          disposition: "unsupported",
          reason: "Native export is not implemented.",
          diagnostics: [],
        }),
        createSpecificationOperation({
          operation: "round-trip-native-source",
          sourceContract: { authority: "Example specification", format, revision: "revision.1" },
          disposition: "not-applicable",
          reason: "The source contract does not define round trip.",
          evidence: [{ evidenceId: "evidence.no-round-trip", digest: evidenceDigest }],
          diagnostics: [],
        }),
      ],
    });
    expect(Object.isFrozen(support)).toBe(true);
    expect(support.operations[0]?.disposition).toBe("supported");

    expect(() =>
      createSpecificationAdapterSupport({
        ...support,
        operations: [] as never,
      }),
    ).toThrow("closed adapter operation matrix");
    for (const sourceContract of [
      { ...observation.sourceContract, authority: "Forged authority" },
      { ...observation.sourceContract, revision: "revision.forged" },
      {
        ...observation.sourceContract,
        format: { ...observation.sourceContract.format, id: extensionNamespace("example.forged") },
      },
      {
        ...observation.sourceContract,
        format: { ...observation.sourceContract.format, version: contractVersion("2.0.0") },
      },
    ]) {
      expect(() =>
        createSpecificationAdapterSupport({
          ...support,
          operations: support.operations.map((operation, index) =>
            index === 0 ? { ...operation, sourceContract } : operation,
          ) as never,
        }),
      ).toThrow("exactly matching adapter authority, format, and revision");
    }
    expect(() =>
      createSpecificationAdapterSupport({
        ...support,
        operations: [...support.operations.slice(0, 4), support.operations[3]] as never,
      }),
    ).toThrow(/unique adapter operation identities|closed adapter operation matrix/);
    expect(() =>
      createSpecificationAdapterSupport({
        ...support,
        operations: [
          support.operations[1],
          support.operations[0],
          ...support.operations.slice(2),
        ] as never,
      }),
    ).toThrow("canonical operation-family order");
    expect(() =>
      createSpecificationOperation({
        operation: "derive-portable-specification",
        sourceContract: { authority: "Example specification", format, revision: "revision.1" },
        disposition: "supported",
        fixtures: [],
        diagnostics: [],
      }),
    ).toThrow("at least one supported-operation fixture");
    expect(() =>
      createSpecificationOperation({
        operation: "round-trip-native-source",
        sourceContract: { authority: "Example specification", format, revision: "revision.1" },
        disposition: "not-applicable",
        reason: "The source contract has no round-trip operation.",
        diagnostics: [],
        evidence: [],
      }),
    ).toThrow("source-contract evidence for not-applicable operations");
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
      createProposedSpecificationChange({
        ...proposal(),
        operation: { ...proposal().operation, operation: "derive-portable-specification" },
      } as never),
    ).toThrow("native-source export operation family");
    expect(() =>
      createProposedSpecificationChange({
        ...proposal(),
        operation: {
          ...proposal().operation,
          sourceContract: {
            ...proposal().operation.sourceContract,
            format: {
              id: extensionNamespace("example.other-specification"),
              version: contractVersion("1.0.0"),
            },
          },
        },
      }),
    ).toThrow("exact target format");
    expect(() =>
      createProposedSpecificationChange({
        ...proposal(),
        operation: {
          operation: "export-native-source",
          sourceContract: { authority: "Example specification", format, revision: "revision.1" },
          disposition: "not-applicable",
          reason: "Export does not apply.",
          evidence: [{ evidenceId: "evidence.no-export", digest: evidenceDigest }],
          diagnostics: [],
        },
      }),
    ).toThrow("model unavailable support as unsupported");

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
