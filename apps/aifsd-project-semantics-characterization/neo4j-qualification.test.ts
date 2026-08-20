import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import neo4j, { type Driver, type ManagedTransaction, type QueryResult } from "neo4j-driver";
import {
  createNeo4jProjectProjectionAdapter,
  NEO4J_SERVER_VERSION,
  type Neo4jQueryPort,
  type Neo4jRecord,
} from "../../packages/aifsd/src/integrations/neo4j/public.js";
import {
  buildProjectProjection,
  type AdmissionRequest,
  type ProjectContentDigester,
} from "../../packages/aifsd/src/project-semantics/public.js";
import { admitProjectEvent } from "../../packages/aifsd/src/project-semantics/admission.js";
import { contentDigest } from "../../packages/aifsd/src/config/content-digest.js";

const uri = process.env.AIFSD_NEO4J_URI;
const password = process.env.AIFSD_NEO4J_PASSWORD;
const projectId = "neo4j-exact-version-characterization";
const digester: ProjectContentDigester = { digest: contentDigest };

const records = (result: QueryResult): readonly Neo4jRecord[] =>
  result.records.map((record) => record.toObject());

const queryIn = async (
  transaction: ManagedTransaction,
  cypher: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<readonly Neo4jRecord[]> => records(await transaction.run(cypher, parameters));

const portFor = (driver: Driver): Neo4jQueryPort => ({
  query: async (cypher, parameters) => {
    const session = driver.session({ database: "neo4j" });
    try {
      return records(await session.run(cypher, parameters));
    } finally {
      await session.close();
    }
  },
  transaction: async (work) => {
    const session = driver.session({ database: "neo4j" });
    try {
      return await session.executeWrite((transaction) =>
        work({ query: (cypher, parameters) => queryIn(transaction, cypher, parameters) }),
      );
    } finally {
      await session.close();
    }
  },
});

const request: AdmissionRequest = {
  eventId: "018f0000-0000-7000-8000-000000000001" as AdmissionRequest["eventId"],
  observation: {
    observationId: "neo4j-characterization-observation",
    projectId,
    kind: "assertions.recorded",
    sourceAuthority: { authorityId: "neo4j-characterization", kind: "coordinator" },
    provenance: { sourceKind: "repository", sourceRef: "neo4j-qualification.test.ts" },
    evidence: [
      "018f1000-0000-7000-8000-000000000001" as AdmissionRequest["observation"]["evidence"][number],
    ],
    correlationId: "neo4j-characterization" as AdmissionRequest["observation"]["correlationId"],
    observedAt: "2026-08-18T00:00:00Z",
    payload: {
      assertions: [
        {
          assertionId: "task-a",
          subjectId: "task-a",
          predicate: "entity.type",
          object: "task",
          authority: { authorityId: "neo4j-characterization", kind: "coordinator" },
          evidence: ["018f1000-0000-7000-8000-000000000001"],
          validFrom: "2026-08-18T00:00:00Z",
        },
        {
          assertionId: "task-b",
          subjectId: "task-b",
          predicate: "entity.type",
          object: "task",
          authority: { authorityId: "neo4j-characterization", kind: "coordinator" },
          evidence: ["018f1000-0000-7000-8000-000000000001"],
          validFrom: "2026-08-18T00:00:00Z",
        },
        {
          assertionId: "dependency",
          subjectId: "task-b",
          predicate: "task.depends-on",
          object: "task-a",
          authority: { authorityId: "neo4j-characterization", kind: "coordinator" },
          evidence: ["018f1000-0000-7000-8000-000000000001"],
          validFrom: "2026-08-18T00:00:00Z",
        },
      ],
    },
  },
};

describe.skipIf(uri === undefined || password === undefined)(
  "Neo4j exact-version project projection",
  () => {
    let driver: Driver;

    beforeAll(async () => {
      driver = neo4j.driver(uri!, neo4j.auth.basic("neo4j", password!), {
        disableLosslessIntegers: true,
      });
      await driver.verifyConnectivity();
    });

    afterAll(async () => {
      await driver.close();
    });

    test("rebuilds, traverses, detects deletion and repairs on Neo4j 5.26.28", async () => {
      const info = await driver.getServerInfo();
      expect(info.agent).toBe(`Neo4j/${NEO4J_SERVER_VERSION}`);
      const admitted = await admitProjectEvent(
        request,
        {
          authorityId: "neo4j-characterization",
          decide: () => ({
            decisionId: "neo4j-characterization-admission",
            authority: { authorityId: "neo4j-characterization", kind: "coordinator" },
            policyId: "project-admission/v1",
            decidedAt: "2026-08-18T00:01:00Z",
          }),
        },
        digester,
      );
      if (!admitted.ok) throw new Error("admission fixture failed");
      const projection = await buildProjectProjection([admitted.value], digester);
      if (!projection.ok) throw new Error("projection fixture failed");
      const port = portFor(driver);
      const adapter = createNeo4jProjectProjectionAdapter(port);
      await adapter.migrate();
      expect((await adapter.project(projection.value)).ok).toBe(true);
      const clean = await adapter.reconcile(projection.value);
      if (!clean.ok) throw new Error("reconciliation failed");
      if (!clean.value.reconciled) {
        throw new Error(`initial projection drift: ${JSON.stringify(clean.value.drift)}`);
      }
      expect(await adapter.relationshipsAt({ projectId, validAt: "2026-08-18T00:02:00Z" })).toEqual(
        [
          expect.objectContaining({
            assertionId: "dependency",
            subjectId: "task-b",
            objectId: "task-a",
          }),
        ],
      );

      await port.query(
        `MATCH (a:AIFSDAssertion {projectId: $projectId, assertionId: 'dependency'})
         SET a.objectCanonical = '"forged"', a.authorityId = 'forged-authority',
             a.evidence = ['forged-evidence'], a.validFrom = '2026-08-18T00:03:00Z',
             a.validTo = '2026-08-19T00:00:00Z',
             a.retractedBy = '018f0000-0000-7000-8000-000000000099',
             a.sourceEventId = '018f0000-0000-7000-8000-000000000099'
         WITH a
         MATCH (:AIFSDEntity {projectId: $projectId})
           -[r:AIFSD_RELATION {projectId: $projectId, assertionId: 'dependency'}]->
           (:AIFSDEntity {projectId: $projectId})
         SET r.sourceEventId = '018f0000-0000-7000-8000-000000000099',
             r.validFrom = '2026-08-18T00:03:00Z', r.validTo = '2026-08-19T00:00:00Z',
             r.retractedBy = '018f0000-0000-7000-8000-000000000099'`,
        { projectId },
      );
      const mutated = await adapter.reconcile(projection.value);
      if (!mutated.ok) throw new Error("reconciliation failed");
      expect(mutated.value.drift).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "divergent", identity: "assertion:dependency" }),
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
      const divergentView = await adapter.readView(projection.value);
      if (!divergentView.ok) throw new Error("view read failed");
      expect(divergentView.value.projectionFresh).toBe(false);
      expect(divergentView.value.assertions).toEqual(projection.value.assertions);
      expect((await adapter.repair(projection.value)).ok).toBe(true);
      const mutationRepair = await adapter.reconcile(projection.value);
      if (!mutationRepair.ok) throw new Error("reconciliation failed");
      expect(mutationRepair.value.reconciled).toBe(true);

      await port.query(
        "MATCH (a:AIFSDAssertion {projectId: $projectId, assertionId: 'dependency'}) DETACH DELETE a",
        { projectId },
      );
      const drift = await adapter.reconcile(projection.value);
      if (!drift.ok) throw new Error("reconciliation failed");
      expect(drift.value.drift.map(({ kind }) => kind)).toContain("missing");
      expect((await adapter.repair(projection.value)).ok).toBe(true);
      const repaired = await adapter.reconcile(projection.value);
      if (!repaired.ok) throw new Error("reconciliation failed");
      expect(repaired.value.reconciled).toBe(true);
    }, 180_000);
  },
);
