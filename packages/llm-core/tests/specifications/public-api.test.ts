import { describe, expect, test } from "bun:test";
import { contractVersion, digest, extensionNamespace, type JsonValue } from "#contracts";
import { isPromiseLike } from "#shared/maybe";
import {
  compileSpecification,
  createPortableIntegrationReference,
  createSpecificationDecision,
  createSpecificationDecisionRecord,
  createSpecificationSourceSnapshot,
  loadSpecification,
  prepareSpecificationExecution,
  projectSpecification,
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
    expect(review.issues).toEqual([]);
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

const reviewedFixture = async (current = { revision: "revision.1" }, content?: JsonValue) => {
  const specification = loadSpecification({
    graphId: "graph.projection",
    version,
    sources: [source()],
    nodes: [
      {
        nodeId: "requirement.projection",
        kind: "requirement",
        title: "Project only while authority is current",
        source: { sourceId: "source.runtime", documentId: "root" },
        ...(content === undefined ? {} : { content }),
      },
    ],
    relationships: [],
  });
  const policy: SpecificationPolicy = {
    decide: ({ review }) =>
      createSpecificationDecision({
        status: "accepted",
        record: createSpecificationDecisionRecord({
          recordId: "decision.projection" as never,
          resolvedDigest,
          acceptedScope: review.items.map((item) => item.scopeId),
          decision: { kind: "policy", summary: "Projection is approved." },
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
          validity: { invalidatedBy: ["source-revision"] },
        }),
      }),
    current: ({ record }) => ({
      authority: record.authority,
      resolvedDigest: record.resolvedDigest,
      acceptedScope: record.acceptedScope,
      policyVersions: record.policyVersions,
      sources: record.sources.map((binding) => ({ ...binding, revision: current.revision })),
    }),
    now: () => "2026-08-01T12:00:00.000Z",
  };
  const decision = await reviewSpecification(specification, { policy });
  if (decision.status !== "accepted") throw new TypeError("Expected an accepted decision.");
  return { current, decision };
};

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
    const prepared = await prepareSpecificationExecution({
      compiled,
      operations: {
        prepare: (definition) => ({ definition }),
        execute: ({ input }) => input,
        resume: ({ input }) => input,
      },
    });
    expect(prepared.execute("explicit-integration")).toBe("explicit-integration");
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
      prepareSpecificationExecution({
        compiled,
        operations: {
          prepare: (definition) => ({ definition }),
          execute: ({ input }) => input,
          resume: ({ input }) => input,
        },
      }),
    ).toThrow("no longer matches");
    expect(forgedAuthority.currentState.current()).toBeDefined();
  });

  test("requires a review-bound accepted decision before compilation", () => {
    const forged = createSpecificationDecision({
      status: "rejected",
      issues: [
        {
          code: "not-accepted",
          severity: "error",
          impact: "blocking",
          explanation: "This decision was not accepted.",
          nodeId: "requirement.runtime" as never,
        },
      ],
    });
    expect(() => compileSpecification(forged, { target: { value: "forged" } })).toThrow(
      "Only accepted specification decisions",
    );
  });

  test("compiles serialized integration references but rejects live native objects", async () => {
    const value = await reviewedFixture();
    const reference = createPortableIntegrationReference({
      integration: extensionNamespace("org.example.langgraph"),
      reference: "graphs/support/v3",
      version,
      metadata: { environment: "test" },
    });
    const compiled = await compileSpecification(value.decision, { target: reference });
    expect(compiled.value as JsonValue).toEqual({
      kind: "integration-reference",
      integration: "org.example.langgraph",
      reference: "graphs/support/v3",
      version: "1.0.0",
      metadata: { environment: "test" },
    });

    const liveNativeGraph = { invoke: () => "not portable" };
    expect(() =>
      compileSpecification(value.decision, {
        target: liveNativeGraph as never,
      }),
    ).toThrow("portable declarative data");
  });

  test("projects lazily after authority and preserves synchronous MaybePromise results", async () => {
    const value = await reviewedFixture();
    let projections = 0;
    const projected = projectSpecification(value.decision, {
      project: (view) => {
        projections += 1;
        expect(Object.isFrozen(view)).toBe(true);
        expect(Object.isFrozen(view.acceptedItems)).toBe(true);
        expect(view.acceptedItems.map((item) => String(item.scopeId))).toEqual([
          "requirement.projection",
        ]);
        return { target: { model: "test" }, result: "exact" };
      },
    });
    expect(isPromiseLike(projected)).toBe(false);
    if (isPromiseLike(projected)) throw new TypeError("Expected synchronous projection.");
    expect(projections).toBe(1);
    expect(projected.compiled.value).toEqual({ model: "test" });
    expect(projected.result).toBe("exact");

    const stale = await reviewedFixture();
    stale.current.revision = "revision.2";
    expect(() =>
      projectSpecification(stale.decision, {
        project: () => {
          projections += 1;
          return { target: { model: "never" }, result: "never" };
        },
      }),
    ).toThrow("no longer matches");
    expect(projections).toBe(1);
  });

  test("projects frozen accepted content, not only accepted scope identifiers", async () => {
    const semanticContent = {
      modelRequirements: [{ capabilityId: "llm-core.model.streaming", required: true }],
      prompt: { name: "prompt.accepted", template: "Answer", inputs: [] },
      tools: [{ name: "lookup", parameters: { type: "object" } }],
      context: { identity: sourceDigest },
      evaluation: { thresholdStatus: "qualified" },
    } satisfies JsonValue;
    const value = await reviewedFixture(undefined, semanticContent);
    const projected = await projectSpecification(value.decision, {
      project: (view) => {
        expect(view.acceptedItems).toHaveLength(1);
        expect(view.acceptedItems[0]?.content).toEqual(semanticContent);
        expect(Object.isFrozen(view.acceptedItems[0]?.content)).toBe(true);
        expect(Object.isFrozen((view.acceptedItems[0]?.content as { tools: unknown }).tools)).toBe(
          true,
        );
        return { target: { model: "test" }, result: "content-bound" };
      },
    });
    expect(projected.result).toBe("content-bound");
  });

  test("rechecks async projection and native execution at application-owned boundaries", async () => {
    const projectedFixture = await reviewedFixture();
    let releaseProjection!: (value: {
      readonly target: { readonly model: string };
      readonly result: string;
    }) => void;
    const pendingProjection = projectSpecification(projectedFixture.decision, {
      project: () =>
        new Promise<{ readonly target: { readonly model: string }; readonly result: string }>(
          (resolve) => (releaseProjection = resolve),
        ),
    });
    projectedFixture.current.revision = "revision.2";
    releaseProjection({ target: { model: "test" }, result: "partial" });
    await expect(pendingProjection).rejects.toThrow("no longer matches");

    const executionFixture = await reviewedFixture();
    const projected = await projectSpecification(executionFixture.decision, {
      project: () => ({ target: { model: "test" }, result: "exact" }),
    });
    let executions = 0;
    const prepared = await prepareSpecificationExecution({
      compiled: projected.compiled,
      operations: {
        prepare: (definition) => ({ definition }),
        execute: ({ input }) => {
          executions += 1;
          return `executed:${input}`;
        },
        resume: ({ input }) => `resumed:${input}`,
      },
    });
    expect(prepared.execute("first")).toBe("executed:first");
    executionFixture.current.revision = "revision.2";
    await expect(Promise.resolve().then(() => prepared.execute("blocked"))).rejects.toThrow(
      "no longer matches",
    );
    expect(executions).toBe(1);
  });
});
