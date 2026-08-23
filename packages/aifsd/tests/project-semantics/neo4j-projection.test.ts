import { describe, expect, test } from "bun:test";
import {
  createNeo4jProjectProjectionAdapter,
  NEO4J_CYPHER,
  NEO4J_DRIVER_VERSION,
  NEO4J_MIGRATIONS,
  NEO4J_SERVER_VERSION,
  type Neo4jQueryPort,
  type Neo4jRecord,
} from "../../src/integrations/neo4j/public.js";
import {
  buildProjectProjection,
  type ProjectProjection,
} from "../../src/project-semantics/public.js";
import { admitProjectEvent } from "../../src/project-semantics/admission.js";
import { admissionRequest, assertion, authority, digester } from "./fixtures/project.js";

interface FakeNeo4j extends Neo4jQueryPort {
  readonly statements: string[];
  readonly drift: (change: Partial<Record<string, unknown>>) => void;
  readonly driftAssertion: (assertionId: string, change: Partial<Record<string, unknown>>) => void;
  readonly driftRelationship: (
    assertionId: string,
    change: Partial<Record<string, unknown>>,
  ) => void;
  readonly clear: () => void;
}

const fakeNeo4j = (): FakeNeo4j => {
  const statements: string[] = [];
  let stored: Readonly<Record<string, unknown>> | null = null;
  const relationshipChanges = new Map<string, Partial<Record<string, unknown>>>();
  const query = async (
    cypher: string,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<readonly Neo4jRecord[]> => {
    statements.push(cypher);
    if (cypher === NEO4J_CYPHER.delete) stored = null;
    if (cypher === NEO4J_CYPHER.replace) {
      stored = parameters;
      relationshipChanges.clear();
    }
    if (cypher === NEO4J_CYPHER.read && stored !== null) {
      return [
        {
          project: {
            properties: {
              projectId: stored.projectId,
              protocolVersion: stored.protocolVersion,
              position: stored.position,
              lastEventId: stored.lastEventId,
              journalDigestAlgorithm: stored.journalDigestAlgorithm,
              journalDigestValue: stored.journalDigestValue,
              projectionDigestAlgorithm: stored.projectionDigestAlgorithm,
              projectionDigestValue: stored.projectionDigestValue,
              schemaId: stored.schemaId,
              migrationId: stored.migrationId,
              authorised: stored.authorised,
            },
          },
          assertions: (stored.assertions as readonly unknown[]).map((properties) => ({
            properties,
          })),
          tasks: (stored.tasks as readonly unknown[]).map((properties) => ({ properties })),
          relationships: (stored.assertions as readonly Record<string, unknown>[])
            .filter(({ objectEntityId }) => objectEntityId !== null)
            .map((item) => ({
              subjectId: item.subjectId,
              predicate: item.predicate,
              objectId: item.objectEntityId,
              assertionId: item.assertionId,
              sourceEventId: item.sourceEventId,
              validFrom: item.validFrom,
              validTo: item.validTo,
              retractedBy: item.retractedBy,
              ...relationshipChanges.get(String(item.assertionId)),
            })),
        },
      ];
    }
    if (cypher === NEO4J_CYPHER.temporalRelationships) {
      return [
        {
          subjectId: "task-b",
          predicate: "task.depends-on",
          objectId: "task-a",
          assertionId: "dependency",
          sourceEventId: "018f0000-0000-7000-8000-000000000001",
        },
      ];
    }
    return [];
  };
  return {
    statements,
    query,
    transaction: async (work) => work({ query }),
    drift: (change) => {
      if (stored !== null) stored = { ...stored, ...change };
    },
    driftAssertion: (assertionId, change) => {
      if (stored === null) return;
      stored = {
        ...stored,
        assertions: (stored.assertions as readonly Record<string, unknown>[]).map((item) =>
          item.assertionId === assertionId ? { ...item, ...change } : item,
        ),
      };
    },
    driftRelationship: (assertionId, change) => {
      relationshipChanges.set(assertionId, change);
    },
    clear: () => {
      stored = null;
      relationshipChanges.clear();
    },
  };
};

const projectionFixture = async (): Promise<ProjectProjection> => {
  const admitted = await admitProjectEvent(
    admissionRequest(1, "assertions.recorded", {
      assertions: [
        assertion("task-a", "task-a", "entity.type", "task"),
        assertion("task-b", "task-b", "entity.type", "task"),
        assertion("dependency", "task-b", "task.depends-on", "task-a"),
      ],
    }),
    authority(),
    digester,
  );
  if (!admitted.ok)
    throw new Error(`fixture admission failed: ${JSON.stringify(admitted.diagnostics)}`);
  const projection = await buildProjectProjection([admitted.value], digester);
  if (!projection.ok) throw new Error("fixture projection failed");
  return projection.value;
};

describe("Neo4j project projection adapter", () => {
  test("pins native identities and executes each migration independently", async () => {
    const port = fakeNeo4j();
    const adapter = createNeo4jProjectProjectionAdapter(port);
    expect(adapter.identity.serverVersion).toBe(NEO4J_SERVER_VERSION);
    expect(adapter.identity.driverVersion).toBe(NEO4J_DRIVER_VERSION);
    await adapter.migrate();
    expect(port.statements).toEqual([...NEO4J_MIGRATIONS]);
  });

  test("projects, reads and temporally traverses without leaking driver values", async () => {
    const port = fakeNeo4j();
    const adapter = createNeo4jProjectProjectionAdapter(port);
    const projection = await projectionFixture();
    expect(
      (
        await adapter.project({
          ...projection,
          protocolVersion: "aifsd.project-projection/0",
        } as unknown as ProjectProjection)
      ).ok,
    ).toBe(false);
    expect((await adapter.project(projection)).ok).toBe(true);
    const read = await adapter.read(projection.projectId);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("projection read failed");
    expect(read.value.projectionDigest).toEqual(projection.projectionDigest);
    expect(read.value.assertions).toEqual(projection.assertions);
    expect(read.value.tasks).toEqual(projection.tasks);
    const relationships = await adapter.relationshipsAt({
      projectId: projection.projectId,
      validAt: "2026-08-18T00:02:00Z",
    });
    expect(relationships).toEqual([
      expect.objectContaining({
        subjectId: "task-b",
        predicate: "task.depends-on",
        objectId: "task-a",
      }),
    ]);
    await expect(
      adapter.relationshipsAt({ projectId: projection.projectId, validAt: "18 August 2026" }),
    ).rejects.toThrow("canonical UTC timestamp");
  });

  test("classifies drift and repairs exclusively from the journal projection", async () => {
    const port = fakeNeo4j();
    const adapter = createNeo4jProjectProjectionAdapter(port);
    const projection = await projectionFixture();
    await adapter.project(projection);
    const clean = await adapter.reconcile(projection);
    if (!clean.ok) throw new Error("reconciliation failed");
    expect(clean.value.reconciled).toBe(true);

    port.drift({ position: 0, authorised: false });
    const drifted = await adapter.reconcile(projection);
    if (!drifted.ok) throw new Error("reconciliation failed");
    expect(drifted.value.drift.map(({ kind }) => kind)).toEqual(["unauthorised", "stale"]);
    expect((await adapter.repair(projection)).ok).toBe(true);
    const repaired = await adapter.reconcile(projection);
    if (!repaired.ok) throw new Error("reconciliation failed");
    expect(repaired.value.reconciled).toBe(true);

    port.clear();
    const missing = await adapter.reconcile(projection);
    if (!missing.ok) throw new Error("reconciliation failed");
    expect(missing.value.drift).toEqual([{ kind: "missing", identity: projection.projectId }]);
  });

  test.each([undefined, "true"])(
    "rejects missing and non-boolean projection authorisation",
    async (authorised) => {
      const port = fakeNeo4j();
      const adapter = createNeo4jProjectProjectionAdapter(port);
      const projection = await projectionFixture();
      await adapter.project(projection);
      port.drift({ authorised });
      expect(await adapter.read(projection.projectId)).toEqual({
        ok: false,
        diagnostics: [{ code: "projection-drift", reasonCode: "projection-divergent" }],
      });
    },
  );

  test("recomputes assertion identity from every graph-owned assertion field", async () => {
    const port = fakeNeo4j();
    const adapter = createNeo4jProjectProjectionAdapter(port);
    const projection = await projectionFixture();
    const mutations: readonly Partial<Record<string, unknown>>[] = [
      { objectCanonical: '"other"' },
      { authorityId: "forged-authority" },
      { authorityKind: "observer" },
      { delegationId: "forged-delegation" },
      { evidence: ["forged-evidence"] },
      { validFrom: "2026-08-18T00:03:00Z" },
      { validTo: "2026-08-19T00:00:00Z" },
      { retractedBy: "018f0000-0000-7000-8000-000000000099" },
      { sourceEventId: "018f0000-0000-7000-8000-000000000099" },
    ];
    for (const mutation of mutations) {
      await adapter.project(projection);
      port.driftAssertion("dependency", mutation);
      const result = await adapter.reconcile(projection);
      if (!result.ok) throw new Error("reconciliation failed");
      expect(result.value.drift).toContainEqual(
        expect.objectContaining({ kind: "divergent", identity: "assertion:dependency" }),
      );
    }
  });

  test("reconciles full checkpoint, schema and complete relationship records", async () => {
    const port = fakeNeo4j();
    const adapter = createNeo4jProjectProjectionAdapter(port);
    const projection = await projectionFixture();
    await adapter.project(projection);
    port.drift({
      lastEventId: "018f0000-0000-7000-8000-000000000099",
      schemaId: "forged-schema",
      migrationId: "forged-migration",
    });
    port.driftRelationship("dependency", {
      sourceEventId: "018f0000-0000-7000-8000-000000000099",
      validFrom: "2026-08-18T00:03:00Z",
      validTo: "2026-08-19T00:00:00Z",
      retractedBy: "018f0000-0000-7000-8000-000000000098",
    });
    const result = await adapter.reconcile(projection);
    if (!result.ok) throw new Error("reconciliation failed");
    expect(result.value.drift).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "divergent", identity: "schema" }),
        expect.objectContaining({ kind: "divergent", identity: "migration" }),
        expect.objectContaining({ kind: "divergent", identity: "journal-checkpoint-identity" }),
        expect.objectContaining({
          kind: "missing",
          identity: expect.stringContaining("relationship:"),
        }),
        expect.objectContaining({
          kind: "unauthorised",
          identity: expect.stringContaining("relationship:"),
        }),
      ]),
    );
  });

  test("builds journal-authoritative views from one captured graph snapshot", async () => {
    const port = fakeNeo4j();
    const adapter = createNeo4jProjectProjectionAdapter(port);
    const projection = await projectionFixture();
    const missing = await adapter.readView(projection);
    if (!missing.ok) throw new Error("view read failed");
    expect(missing.value).toEqual(
      expect.objectContaining({
        assertions: projection.assertions,
        tasks: projection.tasks,
        projectionFresh: false,
        reconciliation: expect.objectContaining({ reconciled: false }),
      }),
    );
    expect(port.statements.filter((statement) => statement === NEO4J_CYPHER.read)).toHaveLength(1);

    await adapter.project(projection);
    port.driftAssertion("dependency", { objectCanonical: '"forged"' });
    const readCountBefore = port.statements.filter(
      (statement) => statement === NEO4J_CYPHER.read,
    ).length;
    const divergent = await adapter.readView(projection);
    if (!divergent.ok) throw new Error("view read failed");
    expect(divergent.value.projectionFresh).toBe(false);
    expect(divergent.value.assertions).toEqual(projection.assertions);
    expect(divergent.value.reconciliation?.drift).toContainEqual(
      expect.objectContaining({ kind: "divergent", identity: "assertion:dependency" }),
    );
    expect(port.statements.filter((statement) => statement === NEO4J_CYPHER.read).length).toBe(
      readCountBefore + 1,
    );
  });

  test("classifies malformed graph values as divergent and repairs from journal authority", async () => {
    const port = fakeNeo4j();
    const adapter = createNeo4jProjectProjectionAdapter(port);
    const projection = await projectionFixture();
    const corruptions = [
      () => port.driftAssertion("dependency", { objectCanonical: "{" }),
      () => port.drift({ projectionDigestAlgorithm: "md5" }),
      () => port.drift({ journalDigestValue: 42 }),
    ] as const;

    for (const corrupt of corruptions) {
      await adapter.project(projection);
      corrupt();
      expect(await adapter.read(projection.projectId)).toEqual({
        ok: false,
        diagnostics: [{ code: "projection-drift", reasonCode: "projection-divergent" }],
      });
      const reconciliation = await adapter.reconcile(projection);
      if (!reconciliation.ok) throw new Error("reconciliation failed");
      expect(reconciliation.value.drift).toEqual([
        { kind: "divergent", identity: projection.projectId },
      ]);
      expect((await adapter.repair(projection)).ok).toBe(true);
      const repaired = await adapter.reconcile(projection);
      if (!repaired.ok) throw new Error("reconciliation failed");
      expect(repaired.value.reconciled).toBe(true);
    }
  });

  test("propagates operational read failures without starting repair writes", async () => {
    let transactionCalls = 0;
    const operationalFailure = new Error("transport unavailable");
    const port: Neo4jQueryPort = {
      query: async () => {
        throw operationalFailure;
      },
      transaction: async (work) => {
        transactionCalls += 1;
        return await work({
          query: async () => {
            throw operationalFailure;
          },
        });
      },
    };
    const adapter = createNeo4jProjectProjectionAdapter(port);
    const projection = await projectionFixture();

    await expect(adapter.reconcile(projection)).rejects.toThrow("transport unavailable");
    await expect(adapter.repair(projection)).rejects.toThrow("transport unavailable");
    expect(transactionCalls).toBe(0);
  });
});
