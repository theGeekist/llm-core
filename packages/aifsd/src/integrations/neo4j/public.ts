import { canonicalize, normalize } from "@aifsd/strict-json";
import { contentDigest } from "../../config/content-digest.js";
import {
  PROJECT_PROJECTION_PROTOCOL_VERSION,
  sameDigest,
  type EventId,
  type JournalCheckpoint,
  type ProjectAuthority,
  type ProjectProjection,
  type ProjectResult,
  type ProjectTemporalQueryPort,
  type ProjectTemporalRelationship,
  type ProjectionDrift,
  type ProjectionReconciliationReport,
  type RuntimeNeutralProjectView,
} from "../../project-semantics/public.js";
import {
  NEO4J_CYPHER,
  NEO4J_DRIVER_VERSION,
  NEO4J_ENTITY_INDEX_ID,
  NEO4J_ASSERTION_INDEX_ID,
  NEO4J_MIGRATION_ID,
  NEO4J_MIGRATIONS,
  NEO4J_PROJECT_INDEX_ID,
  NEO4J_SCHEMA_ID,
  NEO4J_SERVER_VERSION,
  NEO4J_TASK_INDEX_ID,
} from "./cypher.js";
import {
  checkpoint,
  digestValue as digest,
  isCanonicalTimestamp,
  one,
  properties,
  strings,
  type Neo4jRecord,
} from "./values.js";

export {
  NEO4J_CYPHER,
  NEO4J_ASSERTION_INDEX_ID,
  NEO4J_DRIVER_VERSION,
  NEO4J_ENTITY_INDEX_ID,
  NEO4J_MIGRATION_ID,
  NEO4J_MIGRATIONS,
  NEO4J_PROJECT_INDEX_ID,
  NEO4J_SCHEMA_ID,
  NEO4J_SERVER_VERSION,
  NEO4J_TASK_INDEX_ID,
} from "./cypher.js";
export type { Neo4jRecord } from "./values.js";

export interface Neo4jQueryPort {
  readonly query: (
    cypher: string,
    parameters: Readonly<Record<string, unknown>>,
  ) => Promise<readonly Neo4jRecord[]>;
  readonly transaction: <T>(work: (transaction: Neo4jTransactionPort) => Promise<T>) => Promise<T>;
}

export interface Neo4jTransactionPort {
  readonly query: Neo4jQueryPort["query"];
}

export interface Neo4jProjectionIdentity {
  readonly serverVersion: typeof NEO4J_SERVER_VERSION;
  readonly driverVersion: typeof NEO4J_DRIVER_VERSION;
  readonly schemaId: typeof NEO4J_SCHEMA_ID;
  readonly migrationId: typeof NEO4J_MIGRATION_ID;
  readonly projectIndexId: typeof NEO4J_PROJECT_INDEX_ID;
  readonly assertionIndexId: typeof NEO4J_ASSERTION_INDEX_ID;
  readonly taskIndexId: typeof NEO4J_TASK_INDEX_ID;
  readonly entityIndexId: typeof NEO4J_ENTITY_INDEX_ID;
  readonly protocolVersion: typeof PROJECT_PROJECTION_PROTOCOL_VERSION;
}

export interface Neo4jProjectReadSnapshot {
  readonly projectId: string;
  readonly protocolVersion: string;
  readonly checkpoint: JournalCheckpoint;
  readonly projectionDigest: ProjectProjection["projectionDigest"];
  readonly schemaId: string;
  readonly migrationId: string;
  readonly assertions: ProjectProjection["assertions"];
  readonly tasks: ProjectProjection["tasks"];
  readonly relationships: readonly Neo4jTemporalRelationship[];
  readonly authorised: boolean;
}

export interface Neo4jProjectionAdapter {
  readonly identity: Neo4jProjectionIdentity;
  readonly migrate: () => Promise<void>;
  readonly project: (projection: ProjectProjection) => Promise<ProjectResult<void>>;
  readonly read: (projectId: string) => Promise<ProjectResult<Neo4jProjectReadSnapshot>>;
  readonly reconcile: (
    projection: ProjectProjection,
  ) => Promise<ProjectResult<ProjectionReconciliationReport>>;
  readonly repair: (projection: ProjectProjection) => Promise<ProjectResult<void>>;
  readonly relationshipsAt: (
    query: Parameters<ProjectTemporalQueryPort["relationshipsAt"]>[0],
  ) => Promise<readonly ProjectTemporalRelationship[]>;
  readonly readView: (
    projection: ProjectProjection,
  ) => Promise<ProjectResult<RuntimeNeutralProjectView>>;
}

export interface Neo4jTemporalRelationship extends ProjectTemporalRelationship {
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly retractedBy: EventId | null;
}

const failure = (
  reasonCode:
    | "projection-checkpoint-stale"
    | "projection-protocol-mismatch"
    | "projection-missing"
    | "projection-divergent"
    | "projection-unauthorised",
): ProjectResult<never> => ({
  ok: false,
  diagnostics: [{ code: "projection-drift", reasonCode }],
});

const entityIdFrom = (predicate: string, object: unknown): string | null => {
  if (
    object !== null &&
    typeof object === "object" &&
    !Array.isArray(object) &&
    "entityId" in object &&
    typeof (object as { entityId?: unknown }).entityId === "string"
  ) {
    return (object as { entityId: string }).entityId;
  }
  return predicate === "task.depends-on" && typeof object === "string" ? object : null;
};

type RelationshipIdentity = Pick<
  Neo4jTemporalRelationship,
  | "subjectId"
  | "predicate"
  | "objectId"
  | "assertionId"
  | "sourceEventId"
  | "validFrom"
  | "validTo"
  | "retractedBy"
>;

const relationshipIdentity = ({
  subjectId,
  predicate,
  objectId,
  assertionId,
  sourceEventId,
  validFrom,
  validTo,
  retractedBy,
}: RelationshipIdentity): string =>
  canonicalize([
    subjectId,
    predicate,
    objectId,
    assertionId,
    sourceEventId,
    validFrom,
    validTo,
    retractedBy,
  ]);

const projectionParameters = (
  projection: ProjectProjection,
): Readonly<Record<string, unknown>> => ({
  projectId: projection.projectId,
  protocolVersion: projection.protocolVersion,
  position: projection.checkpoint.position,
  lastEventId: projection.checkpoint.lastEventId,
  journalDigestAlgorithm: projection.checkpoint.journalDigest.algorithm,
  journalDigestValue: projection.checkpoint.journalDigest.value,
  projectionDigestAlgorithm: projection.projectionDigest.algorithm,
  projectionDigestValue: projection.projectionDigest.value,
  schemaId: NEO4J_SCHEMA_ID,
  migrationId: NEO4J_MIGRATION_ID,
  assertions: projection.assertions.map(({ assertion, canonicalDigest }) => ({
    assertionId: assertion.assertionId,
    subjectId: assertion.subjectId,
    predicate: assertion.predicate,
    objectCanonical: canonicalize(assertion.object),
    objectEntityId: entityIdFrom(assertion.predicate, assertion.object),
    sourceEventId: assertion.sourceEventId,
    authorityId: assertion.authority.authorityId,
    authorityKind: assertion.authority.kind,
    delegationId: assertion.authority.delegationId ?? null,
    evidence: assertion.evidence,
    validFrom: assertion.validFrom,
    validTo: assertion.validTo ?? null,
    retractedBy: assertion.retractedBy,
    canonicalDigestAlgorithm: canonicalDigest.algorithm,
    canonicalDigestValue: canonicalDigest.value,
  })),
  tasks: projection.tasks,
});

const checkpointDrift = (
  expected: ProjectProjection,
  actual: Neo4jProjectReadSnapshot,
): ProjectionDrift[] => {
  const drift: ProjectionDrift[] = [];
  if (!actual.authorised) drift.push({ kind: "unauthorised", identity: expected.projectId });
  if (actual.protocolVersion !== expected.protocolVersion) {
    drift.push({
      kind: "divergent",
      identity: "protocol",
    });
  }
  if (actual.schemaId !== NEO4J_SCHEMA_ID) {
    drift.push({ kind: "divergent", identity: "schema" });
  }
  if (actual.migrationId !== NEO4J_MIGRATION_ID) {
    drift.push({ kind: "divergent", identity: "migration" });
  }
  if (
    actual.checkpoint.projectId !== expected.checkpoint.projectId ||
    actual.checkpoint.lastEventId !== expected.checkpoint.lastEventId
  ) {
    drift.push({ kind: "divergent", identity: "journal-checkpoint-identity" });
  }
  if (actual.checkpoint.position < expected.checkpoint.position)
    drift.push({
      kind: "stale",
      identity: "checkpoint",
      expectedDigest: expected.checkpoint.journalDigest,
      actualDigest: actual.checkpoint.journalDigest,
    });
  if (
    actual.checkpoint.position > expected.checkpoint.position ||
    !sameDigest(actual.checkpoint.journalDigest, expected.checkpoint.journalDigest)
  )
    drift.push({
      kind: "divergent",
      identity: "journal-checkpoint",
      expectedDigest: expected.checkpoint.journalDigest,
      actualDigest: actual.checkpoint.journalDigest,
    });
  if (!sameDigest(actual.projectionDigest, expected.projectionDigest))
    drift.push({
      kind: "divergent",
      identity: expected.projectId,
      expectedDigest: expected.projectionDigest,
      actualDigest: actual.projectionDigest,
    });
  return drift;
};

const assertionDrift = (
  expected: ProjectProjection,
  actual: Neo4jProjectReadSnapshot,
): ProjectionDrift[] => {
  const drift: ProjectionDrift[] = [];
  const expectedAssertions = new Map(
    expected.assertions.map(({ assertion, canonicalDigest }) => [
      assertion.assertionId,
      canonicalDigest,
    ]),
  );
  const actualAssertions = new Map(
    actual.assertions.map(({ assertion, canonicalDigest }) => [
      assertion.assertionId,
      canonicalDigest,
    ]),
  );
  for (const [assertionId, expectedDigest] of expectedAssertions) {
    const actualDigest = actualAssertions.get(assertionId);
    if (actualDigest === undefined) {
      drift.push({ kind: "missing", identity: `assertion:${assertionId}`, expectedDigest });
    } else if (!sameDigest(expectedDigest, actualDigest)) {
      drift.push({
        kind: "divergent",
        identity: `assertion:${assertionId}`,
        expectedDigest,
        actualDigest,
      });
    }
  }
  for (const assertionId of actualAssertions.keys()) {
    if (!expectedAssertions.has(assertionId)) {
      drift.push({ kind: "unauthorised", identity: `assertion:${assertionId}` });
    }
  }
  return drift;
};

const taskDrift = (
  expected: ProjectProjection,
  actual: Neo4jProjectReadSnapshot,
): ProjectionDrift[] => {
  const drift: ProjectionDrift[] = [];
  const expectedTasks = new Map(expected.tasks.map((task) => [task.taskId, canonicalize(task)]));
  const actualTasks = new Map(actual.tasks.map((task) => [task.taskId, canonicalize(task)]));
  for (const [taskId, expectedTask] of expectedTasks) {
    const actualTask = actualTasks.get(taskId);
    if (actualTask === undefined) drift.push({ kind: "missing", identity: `task:${taskId}` });
    else if (actualTask !== expectedTask)
      drift.push({ kind: "divergent", identity: `task:${taskId}` });
  }
  for (const taskId of actualTasks.keys()) {
    if (!expectedTasks.has(taskId))
      drift.push({ kind: "unauthorised", identity: `task:${taskId}` });
  }
  return drift;
};

const relationshipDrift = (
  expected: ProjectProjection,
  actual: Neo4jProjectReadSnapshot,
): ProjectionDrift[] => {
  const drift: ProjectionDrift[] = [];
  const expectedRelationships = new Set(
    expected.assertions.flatMap(({ assertion }) => {
      const objectId = entityIdFrom(assertion.predicate, assertion.object);
      return objectId === null
        ? []
        : [
            relationshipIdentity({
              subjectId: assertion.subjectId,
              predicate: assertion.predicate,
              objectId,
              assertionId: assertion.assertionId,
              sourceEventId: assertion.sourceEventId,
              validFrom: assertion.validFrom,
              validTo: assertion.validTo ?? null,
              retractedBy: assertion.retractedBy,
            }),
          ];
    }),
  );
  const actualRelationships = new Set(actual.relationships.map(relationshipIdentity));
  for (const relationship of expectedRelationships) {
    if (!actualRelationships.has(relationship)) {
      drift.push({ kind: "missing", identity: `relationship:${relationship}` });
    }
  }
  for (const relationship of actualRelationships) {
    if (!expectedRelationships.has(relationship)) {
      drift.push({ kind: "unauthorised", identity: `relationship:${relationship}` });
    }
  }
  return drift;
};

const driftFor = (
  expected: ProjectProjection,
  actual: Neo4jProjectReadSnapshot | null,
): readonly ProjectionDrift[] =>
  actual === null
    ? [{ kind: "missing", identity: expected.projectId }]
    : [
        ...checkpointDrift(expected, actual),
        ...assertionDrift(expected, actual),
        ...taskDrift(expected, actual),
        ...relationshipDrift(expected, actual),
      ];

export const createNeo4jProjectProjectionAdapter = (
  port: Neo4jQueryPort,
): Neo4jProjectionAdapter => {
  const read = async (projectId: string): Promise<ProjectResult<Neo4jProjectReadSnapshot>> => {
    const records = await port.query(NEO4J_CYPHER.read, { projectId });
    const record = one(records);
    if (record === undefined || record.project === null || typeof record.project !== "object")
      return failure("projection-missing");
    try {
      const project = properties(record.project);
      const assertions = ((record.assertions ?? []) as readonly unknown[])
        .map((value) => {
          const item = properties(value);
          const object = normalize(JSON.parse(String(item.objectCanonical)));
          return {
            assertion: {
              assertionId: String(item.assertionId),
              subjectId: String(item.subjectId),
              predicate: String(item.predicate),
              object,
              sourceEventId: String(item.sourceEventId) as EventId,
              authority: {
                authorityId: String(item.authorityId),
                kind: String(item.authorityKind) as ProjectAuthority["kind"],
                ...(item.delegationId === null || item.delegationId === undefined
                  ? {}
                  : { delegationId: String(item.delegationId) }),
              },
              evidence: (item.evidence ??
                []) as ProjectProjection["assertions"][number]["assertion"]["evidence"],
              validFrom: String(item.validFrom),
              ...(item.validTo === null || item.validTo === undefined
                ? {}
                : { validTo: String(item.validTo) }),
              retractedBy:
                item.retractedBy === null || item.retractedBy === undefined
                  ? null
                  : (String(item.retractedBy) as EventId),
            },
          };
        })
        .map(({ assertion }) => ({ assertion, canonicalDigest: contentDigest(assertion) }));
      const tasks = ((record.tasks ?? []) as readonly unknown[]).map((value) => {
        const item = properties(value);
        return {
          taskId: String(item.taskId),
          readiness: String(item.readiness) as ProjectProjection["tasks"][number]["readiness"],
          completion: String(item.completion) as ProjectProjection["tasks"][number]["completion"],
          dependencies: strings(item.dependencies),
          blockers: strings(item.blockers),
          preconditionAssertionIds: strings(item.preconditionAssertionIds),
          contradictionAssertionIds: strings(item.contradictionAssertionIds),
          sourceEventIds: strings(item.sourceEventIds) as readonly EventId[],
        };
      });
      const relationships = ((record.relationships ?? []) as readonly unknown[])
        .map(properties)
        .filter((item) => item.assertionId !== null)
        .map((item) => ({
          subjectId: String(item.subjectId),
          predicate: String(item.predicate),
          objectId: String(item.objectId),
          assertionId: String(item.assertionId),
          sourceEventId: String(item.sourceEventId) as EventId,
          validFrom: String(item.validFrom),
          validTo:
            item.validTo === null || item.validTo === undefined ? null : String(item.validTo),
          retractedBy:
            item.retractedBy === null || item.retractedBy === undefined
              ? null
              : (String(item.retractedBy) as EventId),
        }));
      return {
        ok: true,
        value: {
          projectId,
          protocolVersion: String(project.protocolVersion),
          checkpoint: checkpoint(project),
          projectionDigest: digest(
            project.projectionDigestAlgorithm,
            project.projectionDigestValue,
          ),
          schemaId: String(project.schemaId),
          migrationId: String(project.migrationId),
          assertions,
          tasks,
          relationships,
          authorised: project.authorised !== false,
        },
      };
    } catch {
      return failure("projection-divergent");
    }
  };
  const reportFor = (
    projection: ProjectProjection,
    actual: Neo4jProjectReadSnapshot | null,
  ): ProjectionReconciliationReport => {
    const drift = driftFor(projection, actual);
    return {
      projectId: projection.projectId,
      protocolVersion: projection.protocolVersion,
      journalCheckpoint: projection.checkpoint,
      expectedProjectionDigest: projection.projectionDigest,
      actualProjectionDigest: actual?.projectionDigest ?? null,
      drift,
      reconciled: drift.length === 0,
    };
  };
  const reconcile = async (
    projection: ProjectProjection,
  ): Promise<ProjectResult<ProjectionReconciliationReport>> => {
    const actualResult = await read(projection.projectId);
    return {
      ok: true,
      value: actualResult.ok
        ? reportFor(projection, actualResult.value)
        : actualResult.diagnostics.some(({ reasonCode }) => reasonCode === "projection-missing")
          ? reportFor(projection, null)
          : {
              ...reportFor(projection, null),
              drift: [{ kind: "divergent", identity: projection.projectId }],
            },
    };
  };
  return {
    identity: {
      serverVersion: NEO4J_SERVER_VERSION,
      driverVersion: NEO4J_DRIVER_VERSION,
      schemaId: NEO4J_SCHEMA_ID,
      migrationId: NEO4J_MIGRATION_ID,
      projectIndexId: NEO4J_PROJECT_INDEX_ID,
      assertionIndexId: NEO4J_ASSERTION_INDEX_ID,
      taskIndexId: NEO4J_TASK_INDEX_ID,
      entityIndexId: NEO4J_ENTITY_INDEX_ID,
      protocolVersion: PROJECT_PROJECTION_PROTOCOL_VERSION,
    },
    migrate: async () => {
      for (const statement of NEO4J_MIGRATIONS) await port.query(statement, {});
    },
    project: async (projection) => {
      if (projection.protocolVersion !== PROJECT_PROJECTION_PROTOCOL_VERSION) {
        return failure("projection-protocol-mismatch");
      }
      await port.transaction(async (transaction) => {
        await transaction.query(NEO4J_CYPHER.delete, { projectId: projection.projectId });
        await transaction.query(NEO4J_CYPHER.replace, projectionParameters(projection));
      });
      return { ok: true, value: undefined };
    },
    read,
    reconcile,
    repair: async (projection) => {
      const result = await reconcile(projection);
      if (!result.ok) return result;
      if (result.value.reconciled) return { ok: true, value: undefined };
      return await port.transaction(async (transaction) => {
        await transaction.query(NEO4J_CYPHER.delete, { projectId: projection.projectId });
        await transaction.query(NEO4J_CYPHER.replace, projectionParameters(projection));
        return { ok: true, value: undefined } as const;
      });
    },
    relationshipsAt: async ({ projectId, validAt }) => {
      if (!isCanonicalTimestamp(validAt)) {
        throw new TypeError("Temporal projection queries require a canonical UTC timestamp.");
      }
      const records = await port.query(NEO4J_CYPHER.temporalRelationships, {
        projectId,
        validAt,
      });
      return records.map((record) => ({
        subjectId: String(record.subjectId),
        predicate: String(record.predicate),
        objectId: String(record.objectId),
        assertionId: String(record.assertionId),
        sourceEventId: String(record.sourceEventId) as EventId,
      }));
    },
    readView: async (projection) => {
      const actual = await read(projection.projectId);
      const reconciliation = actual.ok
        ? reportFor(projection, actual.value)
        : actual.diagnostics.some(({ reasonCode }) => reasonCode === "projection-missing")
          ? reportFor(projection, null)
          : {
              ...reportFor(projection, null),
              drift: [{ kind: "divergent" as const, identity: projection.projectId }],
            };
      return {
        ok: true,
        value: {
          projectId: projection.projectId,
          journalCheckpoint: projection.checkpoint,
          projectionProtocolVersion: projection.protocolVersion,
          projectionDigest: projection.projectionDigest,
          projectionFresh: reconciliation.reconciled,
          tasks: projection.tasks,
          assertions: projection.assertions,
          reconciliation,
        },
      };
    },
  };
};
