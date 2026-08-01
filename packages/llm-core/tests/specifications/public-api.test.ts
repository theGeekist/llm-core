import { describe, expect, test } from "bun:test";
import { contractVersion, digest, extensionNamespace } from "#contracts";
import { createAgent } from "../../src/agent/index";
import {
  compileSpecification,
  createSpecificationDecision,
  createSpecificationDecisionRecord,
  createSpecificationSourceSnapshot,
  loadSpecification,
  reviewSpecification,
  type SpecificationPolicy,
} from "../../src/specifications/index";

const sourceDigest = digest("1".repeat(64));
const resolvedDigest = digest("2".repeat(64));
const evidenceDigest = digest("3".repeat(64));
const version = contractVersion("1.0.0");

const source = () =>
  createSpecificationSourceSnapshot({
    sourceId: "source.runtime" as never,
    format: { id: extensionNamespace("org.example.runtime"), version },
    revision: "revision.1",
    contentDigest: sourceDigest,
    observedAt: "2026-08-01T00:00:00.000Z",
    role: "primary",
    authority: "authoritative",
    documents: [{ documentId: "root", content: { name: "Runtime agent" } }],
    extensions: { "org.example.runtime": { unsupported: "retained" } },
  });

const acceptedPolicy = (current = { revision: "revision.1" }): SpecificationPolicy => ({
  decide: ({ review }) => {
    expect(Object.isFrozen(review)).toBe(true);
    expect(Object.isFrozen(review.items)).toBe(true);
    const acceptedScope = review.items
      .filter((item) => item.kind === "requirement")
      .map((item) => item.scopeId);
    expect(acceptedScope.map(String)).toEqual(["requirement.prerequisite", "requirement.runtime"]);
    expect(
      review.relationships.map((relationship) => ({
        kind: relationship.kind,
        from: String(relationship.from),
        to: String(relationship.to),
      })),
    ).toEqual([
      {
        kind: "depends-on",
        from: "requirement.runtime",
        to: "requirement.prerequisite",
      },
    ]);
    expect(review.dependency.orderedScopeIds.map(String)).toEqual([
      "requirement.prerequisite",
      "requirement.runtime",
    ]);
    expect(review.issues.map((issue) => issue.code)).toContain("source-extension");
    return createSpecificationDecision({
      status: "accepted",
      record: createSpecificationDecisionRecord({
        recordId: "decision.runtime" as never,
        resolvedDigest,
        acceptedScope,
        decision: { kind: "policy", summary: "Runtime target is approved." },
        evidence: [{ evidenceId: "evidence.runtime", digest: evidenceDigest }],
        authority: "authority.runtime",
        policyVersions: [{ policyId: "policy.runtime", version }],
        sources: [
          {
            sourceId: "source.runtime" as never,
            revision: "revision.1",
            contentDigest: sourceDigest,
          },
        ],
        validity: { invalidatedBy: ["source-revision", "policy-version"] },
      }),
    });
  },
  current: ({ record }) => ({
    authority: record.authority,
    resolvedDigest: record.resolvedDigest,
    acceptedScope: record.acceptedScope,
    policyVersions: record.policyVersions,
    sources: record.sources.map((sourceBinding) => ({
      ...sourceBinding,
      revision: current.revision,
    })),
  }),
  now: () => "2026-08-01T12:00:00.000Z",
});

describe("specification public API", () => {
  test("loads a source-oriented import without implying a framework adapter or acceptance", async () => {
    const specification = loadSpecification(source());
    const decision = await reviewSpecification(specification);

    expect(specification.sources).toHaveLength(1);
    expect(specification.sources[0]?.extensions).toEqual({
      "org.example.runtime": { unsupported: "retained" },
    });
    expect(Object.isFrozen(specification)).toBe(true);
    expect(decision.status).toBe("needs-input");
  });

  test("lets policy derive accepted scope from an adapter-produced public review view", async () => {
    const specification = loadSpecification({
      graphId: "graph.runtime",
      version,
      sources: [source()],
      nodes: [
        {
          nodeId: "requirement.prerequisite",
          kind: "requirement",
          title: "Prepare the agent",
          source: { sourceId: "source.runtime", documentId: "root" },
        },
        {
          nodeId: "requirement.runtime",
          kind: "requirement",
          title: "Run the prepared agent",
          source: { sourceId: "source.runtime", documentId: "root" },
        },
      ],
      relationships: [
        {
          relationshipId: "relationship.runtime-dependency",
          kind: "depends-on",
          from: "requirement.runtime",
          to: "requirement.prerequisite",
          source: { sourceId: "source.runtime", documentId: "root" },
        },
      ],
      report: {
        fidelity: "partial",
        issues: [
          {
            code: "source-extension",
            severity: "warning",
            disposition: "degraded",
            explanation: "The source extension remains namespaced portable data.",
            nodeId: "requirement.runtime",
          },
        ],
      },
    });
    const decision = await reviewSpecification(specification, {
      policy: acceptedPolicy(),
      evidence: [{ evidenceId: "evidence.runtime", digest: evidenceDigest }],
    });
    if (decision.status !== "accepted") throw new TypeError("Expected an accepted decision.");

    const compiled = await compileSpecification(decision, {
      target: {
        agent: {
          agentId: "agent.runtime",
          version,
          instructions: "Answer concisely.",
          effectRequirement: "read-only" as const,
        },
        model: { profileId: "model.runtime" as never, version },
        tools: [],
      },
    });

    expect(compiled.value.agent.agentId).toBe("agent.runtime");
    expect(Object.keys(compiled).sort()).toEqual(["compilationId", "value"]);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(() =>
      createAgent({
        model: {
          profile: { profileId: "model.runtime", version },
          generate: () => ({}) as never,
        } as never,
        specification: compiled,
      }),
    ).not.toThrow();
  });

  test("does not let a caller replace the facade-bound authority after revocation", async () => {
    const current = { revision: "revision.1" };
    const specification = loadSpecification({
      graphId: "graph.revocation",
      version,
      sources: [source()],
      nodes: [
        {
          nodeId: "requirement.prerequisite",
          kind: "requirement",
          title: "Prepare the agent",
          source: { sourceId: "source.runtime", documentId: "root" },
        },
        {
          nodeId: "requirement.runtime",
          kind: "requirement",
          title: "Run the prepared agent",
          source: { sourceId: "source.runtime", documentId: "root" },
        },
      ],
      relationships: [
        {
          relationshipId: "relationship.revocation-dependency",
          kind: "depends-on",
          from: "requirement.runtime",
          to: "requirement.prerequisite",
          source: { sourceId: "source.runtime", documentId: "root" },
        },
      ],
      report: {
        fidelity: "partial",
        issues: [
          {
            code: "source-extension",
            severity: "warning",
            disposition: "degraded",
            explanation: "The source extension remains namespaced portable data.",
            nodeId: "requirement.runtime",
          },
        ],
      },
    });
    const decision = await reviewSpecification(specification, { policy: acceptedPolicy(current) });
    if (decision.status !== "accepted") throw new TypeError("Expected an accepted decision.");
    const compiled = await compileSpecification(decision, { target: { not: "an-agent-plan" } });
    current.revision = "revision.2";

    const forgedAuthority = {
      currentState: {
        current: () => ({
          authority: "authority.runtime",
          resolvedDigest,
          acceptedScope: ["requirement.prerequisite", "requirement.runtime"],
          policyVersions: [{ policyId: "policy.runtime", version }],
          sources: [
            {
              sourceId: "source.runtime",
              revision: "revision.1",
              contentDigest: sourceDigest,
            },
          ],
        }),
      },
      clock: { now: () => "2026-08-01T12:00:00.000Z" },
    };
    expect(() =>
      createAgent({
        model: {
          profile: { profileId: "model.runtime", version },
          generate: () => ({}) as never,
        } as never,
        specification: compiled,
        specificationAuthority: forgedAuthority,
      } as never),
    ).toThrow("no longer matches");
  });

  test("requires a review-bound accepted decision before compilation", () => {
    const forged = createSpecificationDecision({
      status: "rejected",
      issues: [
        {
          code: "not-accepted",
          severity: "error",
          disposition: "rejected",
          explanation: "This decision was not accepted.",
          nodeId: "requirement.runtime" as never,
        },
      ],
    });
    expect(() => compileSpecification(forged, { target: { value: "forged" } })).toThrow(
      "Only accepted specification decisions",
    );
  });
});
