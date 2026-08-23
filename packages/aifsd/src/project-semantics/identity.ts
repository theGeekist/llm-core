import type { Digest } from "@geekist/llm-core/contracts";
import type {
  AcceptedProjectEvent,
  AdmissionRequest,
  ProjectContentDigester,
  ProjectObservation,
} from "./contract.js";

const observationIdentityInput = (observation: ProjectObservation): unknown => ({
  observationId: observation.observationId,
  projectId: observation.projectId,
  kind: observation.kind,
  sourceAuthority: observation.sourceAuthority,
  provenance: observation.provenance,
  evidence: observation.evidence,
  ...(observation.causationId === undefined ? {} : { causationId: observation.causationId }),
  correlationId: observation.correlationId,
  observedAt: observation.observedAt,
  payload: observation.payload,
});

export const admissionRequestIdentityInput = (request: AdmissionRequest): unknown => ({
  eventId: request.eventId,
  observation: observationIdentityInput(request.observation),
});

export const acceptedEventAdmissionRequestIdentityInput = (
  event: AcceptedProjectEvent,
): unknown => ({
  eventId: event.eventId,
  observation: observationIdentityInput({
    observationId: event.observationId,
    projectId: event.projectId,
    kind: event.kind,
    sourceAuthority: event.sourceAuthority,
    provenance: event.provenance,
    evidence: event.evidence,
    ...(event.causationId === undefined ? {} : { causationId: event.causationId }),
    correlationId: event.correlationId,
    observedAt: event.observedAt,
    payload: event.payload,
  }),
});

export const acceptedEventIdentityInput = (
  event: Omit<AcceptedProjectEvent, "eventDigest">,
): unknown => ({
  eventId: event.eventId,
  observationId: event.observationId,
  projectId: event.projectId,
  kind: event.kind,
  sourceAuthority: event.sourceAuthority,
  admission: event.admission,
  provenance: event.provenance,
  evidence: event.evidence,
  ...(event.causationId === undefined ? {} : { causationId: event.causationId }),
  correlationId: event.correlationId,
  observedAt: event.observedAt,
  admittedAt: event.admittedAt,
  payload: event.payload,
  payloadDigest: event.payloadDigest,
});

export const sameDigest = (left: Digest, right: Digest): boolean =>
  left.algorithm === right.algorithm && left.value === right.value;

export const projectContentDigester = (
  implementation: ProjectContentDigester["digest"],
): ProjectContentDigester => ({ digest: implementation });
