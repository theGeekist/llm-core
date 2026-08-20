import { coreId, externalId } from "@geekist/llm-core/contracts";
import type {
  AdmissionAuthority,
  AdmissionRequest,
  CorrelationId,
  EventId,
  EvidenceId,
  JsonValue,
  ProjectAssertion,
  ProjectAuthority,
  ProjectContentDigester,
  ProjectEventKind,
  ProjectObservation,
} from "../../../src/project-semantics/public.js";
import { contentDigest } from "../../../src/config/content-digest.js";

export const projectId = "project-semantic-characterization";

export const coordinator: ProjectAuthority = {
  authorityId: "coordinator.project-admission",
  kind: "coordinator",
};

export const eventId = (sequence: number): EventId =>
  coreId<EventId>(`018f0000-0000-7000-8000-${sequence.toString().padStart(12, "0")}`);

export const evidenceId = (sequence: number): EvidenceId =>
  coreId<EvidenceId>(`018f1000-0000-7000-8000-${sequence.toString().padStart(12, "0")}`);

export const correlationId = (sequence: number): CorrelationId =>
  externalId<CorrelationId>(`project-correlation-${sequence}`);

export const digester: ProjectContentDigester = { digest: contentDigest };

export const authority = (accepted = true): AdmissionAuthority => ({
  authorityId: coordinator.authorityId,
  decide: (request) => {
    if (!accepted) return null;
    const sequence = request.observation.observationId.replace("observation-", "");
    return {
      decisionId: `admission-${sequence}`,
      authority: coordinator,
      policyId: "project-admission/v1",
      decidedAt: request.observation.observedAt.replace("T00:00:", "T00:01:"),
    };
  },
});

export const assertion = (
  ...[assertionId, subjectId, predicate, object, sequence = 1]: [
    string,
    string,
    string,
    ProjectAssertion["object"],
    number?,
  ]
): JsonValue =>
  ({
    assertionId,
    subjectId,
    predicate,
    object,
    authority: coordinator,
    evidence: [evidenceId(sequence)],
    validFrom: "2026-08-18T00:00:00Z",
  }) as unknown as JsonValue;

export const generatedTaskGraphAssertions = (): readonly JsonValue[] => [
  assertion("task-a-type", "task-a", "entity.type", "task"),
  assertion("task-a-complete", "task-a", "task.completed", true),
  assertion("task-b-type", "task-b", "entity.type", "task"),
  assertion("task-b-incomplete", "task-b", "task.completed", false),
  assertion("task-b-dependency", "task-b", "task.depends-on", "task-c"),
  assertion("task-c-type", "task-c", "entity.type", "task"),
  assertion("task-c-incomplete", "task-c", "task.completed", false),
  assertion("task-c-complete", "task-c", "task.completed", true),
];

export const observation = (
  ...[sequence, kind, payload, causationId]: [
    number,
    ProjectEventKind,
    ProjectObservation["payload"],
    EventId?,
  ]
): ProjectObservation => ({
  observationId: `observation-${sequence}`,
  projectId,
  kind,
  sourceAuthority: coordinator,
  provenance: {
    sourceKind: "repository",
    sourceRef: "packages/aifsd/docs/final-architecture/tasks/example.md",
    revision: "32dfe690bbb8472224a65ce3bdb43264dff3d46d",
  },
  evidence: [evidenceId(sequence)],
  ...(causationId === undefined ? {} : { causationId }),
  correlationId: correlationId(sequence),
  observedAt: `2026-08-18T00:00:${sequence.toString().padStart(2, "0")}Z`,
  payload,
});

export const admissionRequest = (
  ...[sequence, kind, payload, causationId]: [
    number,
    ProjectEventKind,
    ProjectObservation["payload"],
    EventId?,
  ]
): AdmissionRequest => ({
  eventId: eventId(sequence),
  observation: observation(sequence, kind, payload, causationId),
});
