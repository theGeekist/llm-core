import { describe, expect, test } from "bun:test";
import { contractVersion, digest, extensionNamespace } from "#contracts";
import { isPromiseLike, type MaybePromise } from "#shared/maybe";
import { createSpecificationSourceSnapshot } from "../../src/features/specifications/public";
import { createSpecificationGraph } from "../../src/features/specifications/factory";
import {
  compileSpecification,
  reviewSpecification,
} from "../../src/application/specification-compiler/public";
import {
  isAcceptedSpecificationHandle,
  registerAcceptedSpecification,
  verifyCompilationAuthority,
} from "../../src/application/specification-compiler/runtime";
import type {
  AcceptedSpecificationHandle,
  SpecificationAuthorityDependencies,
  SpecificationAuthorityState,
} from "../../src/application/specification-compiler/types";
import type {
  SpecificationDecision,
  SpecificationDecisionRecord,
  SpecificationGraph,
  SpecificationNodeId,
  SpecificationSourceId,
} from "../../src/features/specifications/types";

const sourceId = "source.product" as SpecificationSourceId;
const firstNodeId = "requirement.one" as SpecificationNodeId;
const secondNodeId = "requirement.two" as SpecificationNodeId;
const safeNodeId = "requirement.safe" as SpecificationNodeId;
const cycleFirstNodeId = "cycle.a" as SpecificationNodeId;
const cycleSecondNodeId = "cycle.b" as SpecificationNodeId;
const sourceDigest = digest("1".repeat(64));
const resolvedDigest = digest("2".repeat(64));
const evidenceDigest = digest("3".repeat(64));

const source = () =>
  createSpecificationSourceSnapshot({
    sourceId,
    format: { id: extensionNamespace("org.example.openspec"), version: contractVersion("1.0.0") },
    revision: "revision.1",
    contentDigest: sourceDigest,
    observedAt: "2026-08-01T00:00:00.000Z",
    role: "primary",
    authority: "authoritative",
    documents: [{ documentId: "root.document", content: { title: "Launch" } }],
  } as never);

const graph = (
  relationships: readonly unknown[] = [],
  nodes: readonly unknown[] = [
    {
      nodeId: firstNodeId,
      kind: "requirement",
      title: "First requirement",
      source: { sourceId, documentId: "root.document" },
    },
    {
      nodeId: secondNodeId,
      kind: "requirement",
      title: "Second requirement",
      source: { sourceId, documentId: "root.document" },
    },
  ],
): SpecificationGraph =>
  createSpecificationGraph({
    graphId: "graph.product",
    version: contractVersion("1.0.0"),
    sources: [source()],
    nodes,
    relationships,
  } as never);

const acceptedDecision = (): SpecificationDecision => ({
  status: "accepted",
  record: {
    recordId: "decision-record.1",
    resolvedDigest,
    acceptedScope: [firstNodeId, secondNodeId],
    decision: { kind: "human", summary: "Approved for compilation." },
    evidence: [{ evidenceId: "evidence.review", digest: evidenceDigest }],
    authority: "authority.product",
    policyVersions: [{ policyId: "policy.approval", version: contractVersion("1.0.0") }],
    sources: [{ sourceId, revision: "revision.1", contentDigest: sourceDigest }],
    validity: { expiresAt: "2026-08-02T00:00:00.000Z", invalidatedBy: ["source-revision"] },
  } as unknown as SpecificationDecisionRecord,
});

const acceptedDecisionForScope = (
  acceptedScope: readonly SpecificationNodeId[],
): SpecificationDecision => {
  const decision = acceptedDecision();
  if (decision.status !== "accepted") throw new TypeError("Test decision must be accepted.");
  return { status: "accepted", record: { ...decision.record, acceptedScope } };
};

const current = (): SpecificationAuthorityState => {
  const decision = acceptedDecision();
  if (decision.status !== "accepted") throw new TypeError("Test decision must be accepted.");
  return {
    authority: decision.record.authority,
    resolvedDigest: decision.record.resolvedDigest,
    acceptedScope: decision.record.acceptedScope,
    policyVersions: decision.record.policyVersions,
    sources: decision.record.sources,
  };
};

const dependencies = (
  state: SpecificationAuthorityState,
  now = "2026-08-01T12:00:00.000Z",
): SpecificationAuthorityDependencies => ({
  currentState: { current: () => state },
  clock: { now: () => now },
});

const sync = <T>(value: MaybePromise<T>): T => {
  if (isPromiseLike(value)) throw new TypeError("Expected synchronous compiler result.");
  return value;
};

const register = (
  value = graph(),
  authority = dependencies(current()),
): AcceptedSpecificationHandle =>
  sync(registerAcceptedSpecification({ graph: value, decision: acceptedDecision(), authority }));

describe("specification compiler", () => {
  test("registers only current accepted decisions and compiles with a fresh synchronous pipeline", () => {
    const authority = dependencies(current());
    const accepted = register(graph(), authority);
    let calls = 0;
    const compiled = sync(
      compileSpecification({
        accepted,
        authority,
        compiler: {
          compile: ({ plan }) => {
            calls += 1;
            return { dependencyOrder: plan.dependency.orderedNodeIds };
          },
        },
      }),
    );

    expect(calls).toBe(1);
    expect(compiled.value).toEqual({ dependencyOrder: [firstNodeId, secondNodeId] });
    expect(isAcceptedSpecificationHandle(accepted)).toBe(true);
    expect(Object.hasOwn(compiled, "authority")).toBe(false);
    expect(Object.hasOwn(compiled, "accepted")).toBe(false);
    expect(sync(verifyCompilationAuthority({ compiled, authority }))).toBeUndefined();
  });

  test("rejects reconstructed handles and every changed authority binding before target compilation", () => {
    const initial = current();
    const accepted = register(graph(), dependencies(initial));
    const forged = { ...accepted } as AcceptedSpecificationHandle;
    let calls = 0;
    let forgedAuthorityReads = 0;
    const compiler = { compile: () => ({ value: "compiled" }) };
    const forgedAuthority: SpecificationAuthorityDependencies = {
      currentState: {
        current: () => {
          forgedAuthorityReads += 1;
          return initial;
        },
      },
      clock: { now: () => "2026-08-01T12:00:00.000Z" },
    };
    expect(() =>
      compileSpecification({ accepted: forged, authority: forgedAuthority, compiler }),
    ).toThrow("registered accepted specification handle");
    expect(forgedAuthorityReads).toBe(0);

    const changedStates: SpecificationAuthorityState[] = [
      { ...initial, authority: "authority.changed" },
      { ...initial, resolvedDigest: digest("4".repeat(64)) },
      { ...initial, acceptedScope: [firstNodeId] },
      {
        ...initial,
        policyVersions: [{ policyId: "policy.approval", version: contractVersion("2.0.0") }],
      },
      { ...initial, sources: [{ sourceId, revision: "revision.2", contentDigest: sourceDigest }] },
    ];
    for (const changed of changedStates) {
      expect(() =>
        compileSpecification({
          accepted,
          authority: dependencies(changed),
          compiler: {
            compile: () => {
              calls += 1;
              return { value: "compiled" };
            },
          },
        }),
      ).toThrow("Specification authority state no longer matches");
    }
    expect(calls).toBe(0);
  });

  test("rechecks expiry at compilation and authority snapshots after compilation", () => {
    const initial = current();
    const accepted = register(graph(), dependencies(initial));
    let calls = 0;
    expect(() =>
      compileSpecification({
        accepted,
        authority: dependencies(initial, "2026-08-02T00:00:00.000Z"),
        compiler: { compile: () => ({ calls: ++calls }) },
      }),
    ).toThrow("has expired");
    expect(calls).toBe(0);

    const compiled = sync(
      compileSpecification({
        accepted,
        authority: dependencies(initial),
        compiler: { compile: () => ({ value: "compiled" }) },
      }),
    );
    expect(() =>
      verifyCompilationAuthority({
        compiled,
        authority: dependencies({ ...initial, authority: "authority.changed" }),
      }),
    ).toThrow("no longer matches");
  });

  test("preserves async ports and target compilers without exposing durable pipeline state", async () => {
    const state = current();
    const authority: SpecificationAuthorityDependencies = {
      currentState: { current: async () => state },
      clock: { now: () => "2026-08-01T12:00:00.000Z" },
    };
    const accepted = await registerAcceptedSpecification({
      graph: graph(),
      decision: acceptedDecision(),
      authority,
    });
    const pending = compileSpecification({
      accepted,
      authority,
      compiler: { compile: async () => ({ target: "async" }) },
    });
    expect(isPromiseLike(pending)).toBe(true);
    const compiled = await pending;
    expect(compiled.value).toEqual({ target: "async" });
    expect(Object.hasOwn(compiled, "pause")).toBe(false);
  });

  test("rechecks authority after an async target compiler before registering its result", async () => {
    let currentState = current();
    const authority: SpecificationAuthorityDependencies = {
      currentState: { current: () => currentState },
      clock: { now: () => "2026-08-01T12:00:00.000Z" },
    };
    const accepted = register(graph(), authority);
    let resolveTarget: (value: { readonly target: string }) => void;
    const target = new Promise<{ readonly target: string }>((resolve) => {
      resolveTarget = resolve;
    });
    const pending = compileSpecification({
      accepted,
      authority,
      compiler: { compile: () => target },
    });
    if (!isPromiseLike(pending)) throw new TypeError("Expected asynchronous compiler result.");
    currentState = {
      ...currentState,
      sources: [{ sourceId, revision: "revision.2", contentDigest: sourceDigest }],
    };
    resolveTarget!({ target: "late" });
    await expect(pending).rejects.toThrow("no longer matches");
  });

  test("reports dependency-only cycles while preserving semantic workflow cycles", () => {
    const dependencyCycle = graph([
      {
        relationshipId: "dependency.one",
        kind: "depends-on",
        from: firstNodeId,
        to: secondNodeId,
        source: { sourceId, documentId: "root.document" },
      },
      {
        relationshipId: "dependency.two",
        kind: "depends-on",
        from: secondNodeId,
        to: firstNodeId,
        source: { sourceId, documentId: "root.document" },
      },
    ]);
    const rejected = reviewSpecification({ graph: dependencyCycle, decision: acceptedDecision() });
    expect(rejected.decision.status).toBe("rejected");
    expect(rejected.dependency.blockedNodeIds).toEqual([firstNodeId, secondNodeId]);

    const workflowCycle = graph([
      {
        relationshipId: "workflow.one",
        kind: "relates",
        from: firstNodeId,
        to: secondNodeId,
        source: { sourceId, documentId: "root.document" },
      },
      {
        relationshipId: "workflow.two",
        kind: "relates",
        from: secondNodeId,
        to: firstNodeId,
        source: { sourceId, documentId: "root.document" },
      },
    ]);
    const accepted = reviewSpecification({ graph: workflowCycle, decision: acceptedDecision() });
    expect(accepted.decision.status).toBe("accepted");
    expect(accepted.workflow.relationshipIds.map(String)).toEqual(["workflow.one", "workflow.two"]);

    const questionGraph = structuredClone(graph()) as unknown as {
      nodes: Array<{ kind: string }>;
    };
    questionGraph.nodes[0]!.kind = "question";
    const needsInput = reviewSpecification({
      graph: questionGraph as unknown as SpecificationGraph,
      decision: acceptedDecision(),
    });
    expect(needsInput.decision.status).toBe("needs-input");

    const dependentOnly = acceptedDecision();
    if (dependentOnly.status !== "accepted") throw new TypeError("Test decision must be accepted.");
    const dependency = graph([
      {
        relationshipId: "dependency.scope",
        kind: "depends-on",
        from: firstNodeId,
        to: secondNodeId,
        source: { sourceId, documentId: "root.document" },
      },
    ]);
    const partialState = { ...current(), acceptedScope: [firstNodeId] };
    const partialAccepted = sync(
      registerAcceptedSpecification({
        graph: dependency,
        decision: {
          status: "accepted",
          record: { ...dependentOnly.record, acceptedScope: [firstNodeId] },
        },
        authority: dependencies(partialState),
      }),
    );
    let partialCalls = 0;
    expect(() =>
      compileSpecification({
        accepted: partialAccepted,
        authority: dependencies(partialState),
        compiler: { compile: () => ({ value: ++partialCalls }) },
      }),
    ).toThrow("unresolved dependency prerequisites");
    expect(partialCalls).toBe(0);
  });

  test("does not let an unrelated dependency cycle reject an accepted safe scope", () => {
    const nodes = [
      {
        nodeId: safeNodeId,
        kind: "requirement",
        title: "Safe requirement",
        source: { sourceId, documentId: "root.document" },
      },
      {
        nodeId: cycleFirstNodeId,
        kind: "requirement",
        title: "Cycle first requirement",
        source: { sourceId, documentId: "root.document" },
      },
      {
        nodeId: cycleSecondNodeId,
        kind: "requirement",
        title: "Cycle second requirement",
        source: { sourceId, documentId: "root.document" },
      },
    ];
    const cycleGraph = graph(
      [
        {
          relationshipId: "cycle.first",
          kind: "depends-on",
          from: cycleFirstNodeId,
          to: cycleSecondNodeId,
          source: { sourceId, documentId: "root.document" },
        },
        {
          relationshipId: "cycle.second",
          kind: "depends-on",
          from: cycleSecondNodeId,
          to: cycleFirstNodeId,
          source: { sourceId, documentId: "root.document" },
        },
      ],
      nodes,
    );
    const noScope = reviewSpecification({ graph: cycleGraph });
    expect(noScope.decision.status).toBe("needs-input");

    const review = reviewSpecification({
      graph: cycleGraph,
      decision: acceptedDecisionForScope([safeNodeId]),
    });

    expect(review.decision.status).toBe("accepted");
    expect(review.dependency.blockedNodeIds).toEqual([cycleFirstNodeId, cycleSecondNodeId]);
    expect(review.issues.map((issue) => issue.nodeId)).toEqual([
      cycleFirstNodeId,
      cycleSecondNodeId,
    ]);
  });
});
