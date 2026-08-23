/** Native, deterministic Cypher used by the project projection adapter. */

export const NEO4J_SERVER_VERSION = "5.26.28" as const;
export const NEO4J_DRIVER_VERSION = "6.2.0" as const;
export const NEO4J_SCHEMA_ID = "aifsd.project-projection.schema/1" as const;
export const NEO4J_MIGRATION_ID = "aifsd.project-projection.migration/1" as const;
export const NEO4J_PROJECT_INDEX_ID = "aifsd.project-projection.project-id/1" as const;
export const NEO4J_ASSERTION_INDEX_ID = "aifsd.project-projection.assertion-id/1" as const;
export const NEO4J_TASK_INDEX_ID = "aifsd.project-projection.task-id/1" as const;
export const NEO4J_ENTITY_INDEX_ID = "aifsd.project-projection.entity-id/1" as const;

export const NEO4J_MIGRATIONS = [
  `CREATE CONSTRAINT aifsd_project_id IF NOT EXISTS FOR (p:AIFSDProject) REQUIRE p.projectId IS UNIQUE`,
  `CREATE CONSTRAINT aifsd_assertion_id IF NOT EXISTS FOR (a:AIFSDAssertion) REQUIRE (a.projectId, a.assertionId) IS UNIQUE`,
  `CREATE CONSTRAINT aifsd_task_id IF NOT EXISTS FOR (t:AIFSDTask) REQUIRE (t.projectId, t.taskId) IS UNIQUE`,
  `CREATE CONSTRAINT aifsd_entity_id IF NOT EXISTS FOR (e:AIFSDEntity) REQUIRE (e.projectId, e.entityId) IS UNIQUE`,
] as const;

export const NEO4J_CYPHER = {
  /** Replace one project atomically. MERGE makes duplicate delivery harmless. */
  replace: `MERGE (project:AIFSDProject {projectId: $projectId})
SET project.protocolVersion = $protocolVersion, project.position = $position,
    project.lastEventId = $lastEventId,
    project.journalDigestAlgorithm = $journalDigestAlgorithm,
    project.journalDigestValue = $journalDigestValue,
    project.projectionDigestAlgorithm = $projectionDigestAlgorithm,
    project.projectionDigestValue = $projectionDigestValue, project.schemaId = $schemaId,
    project.migrationId = $migrationId, project.authorised = $authorised
WITH project
UNWIND $assertions AS item
MERGE (assertion:AIFSDAssertion {projectId: $projectId, assertionId: item.assertionId})
SET assertion += item
MERGE (project)-[:HAS_ASSERTION]->(assertion)
MERGE (subject:AIFSDEntity {projectId: $projectId, entityId: item.subjectId})
MERGE (assertion)-[:HAS_SUBJECT]->(subject)
FOREACH (_ IN CASE WHEN item.objectEntityId IS NULL THEN [] ELSE [1] END |
  MERGE (object:AIFSDEntity {projectId: $projectId, entityId: item.objectEntityId})
  MERGE (subject)-[relation:AIFSD_RELATION {projectId: $projectId, assertionId: item.assertionId}]->(object)
  SET relation.predicate = item.predicate, relation.sourceEventId = item.sourceEventId,
      relation.validFrom = item.validFrom, relation.validTo = item.validTo,
      relation.retractedBy = item.retractedBy)
WITH project
UNWIND $tasks AS item
MERGE (task:AIFSDTask {projectId: $projectId, taskId: item.taskId})
SET task += item
MERGE (project)-[:HAS_TASK]->(task)
RETURN project.projectId AS projectId, project.projectionDigest AS projectionDigest`,
  read: `MATCH (project:AIFSDProject {projectId: $projectId})
OPTIONAL MATCH (project)-[:HAS_ASSERTION]->(assertion:AIFSDAssertion)
OPTIONAL MATCH (project)-[:HAS_TASK]->(task:AIFSDTask)
OPTIONAL MATCH (subject:AIFSDEntity {projectId: $projectId})
  -[relation:AIFSD_RELATION {projectId: $projectId}]->
  (object:AIFSDEntity {projectId: $projectId})
RETURN project, collect(DISTINCT assertion) AS assertions,
       collect(DISTINCT task) AS tasks,
       collect(DISTINCT {subjectId: subject.entityId, predicate: relation.predicate,
         objectId: object.entityId, assertionId: relation.assertionId,
         sourceEventId: relation.sourceEventId, validFrom: relation.validFrom,
         validTo: relation.validTo, retractedBy: relation.retractedBy}) AS relationships`,
  delete: `MATCH (project:AIFSDProject {projectId: $projectId})
OPTIONAL MATCH (project)-[:HAS_ASSERTION|HAS_TASK]->(owned)
OPTIONAL MATCH (entity:AIFSDEntity {projectId: $projectId})
DETACH DELETE project, owned, entity`,
  inspect: `MATCH (project:AIFSDProject {projectId: $projectId})
RETURN project.projectId AS projectId, project.protocolVersion AS protocolVersion,
       project.position AS position, project.lastEventId AS lastEventId,
       project.journalDigestAlgorithm AS journalDigestAlgorithm,
       project.journalDigestValue AS journalDigestValue,
       project.projectionDigestAlgorithm AS projectionDigestAlgorithm,
       project.projectionDigestValue AS projectionDigestValue,
       project.schemaId AS schemaId, project.migrationId AS migrationId,
       project.authorised AS authorised`,
  temporalRelationships: `MATCH (subject:AIFSDEntity {projectId: $projectId})
-[relation:AIFSD_RELATION {projectId: $projectId}]->
(object:AIFSDEntity {projectId: $projectId})
WHERE relation.validFrom <= $validAt
  AND (relation.validTo IS NULL OR $validAt < relation.validTo)
  AND relation.retractedBy IS NULL
RETURN subject.entityId AS subjectId, relation.predicate AS predicate,
       object.entityId AS objectId, relation.assertionId AS assertionId,
       relation.sourceEventId AS sourceEventId
ORDER BY subjectId, predicate, objectId, assertionId`,
} as const;
